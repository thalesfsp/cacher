import _ from 'lodash';
import { CacheControl, DataSource, DefaultKeySeparator, HTTPStatusCodes, HTTPVerbs, MatchAllChar, MatchGET, PackageName } from './shared';
import { Config, WarmerURL } from './types';
import { ErrorHandler, LoggerFactory, MassagePath, MassageRequestPath, Matches, OrderQueryParamsFromURL, ResponseInterceptor, SetDataSourceHeader } from './utils';
import { IStorage } from './storage';
import { NextFunction, Request, RequestHandler, Response } from 'express';
import { Process } from './fetcher';
import fs from 'fs';
import path from 'path';

export { RedisStorage } from './redis.storage';
export { Storage } from './storage';

const mainLogger = LoggerFactory('main');

mainLogger('WARN: Cacher is running in debug mode');

// Cacher is an ExpressJS middleware which caches responses.
export default class Cacher {
  // Cacher configuration.
  private config: Config;

  constructor(config: Config) {
    this.config = config;

    //////
    // Validation.
    //////

    if (!this.config) throw new Error('Missing configuration');

    this.validateConfig();
    this.validateKey();
    this.validateMatcher();
    this.validateWarmer();

    // Should only run Warmer if it's clearly configured.
    if (this.config.warmer.enabled) this.Warmer();

    LoggerFactory('config')('Cacher initialized', JSON.stringify(this.config, null, 2));

    return this.middleware() as any;
  }

  // Validates config, and sets defaults.
  private validateConfig() {
    if (this.config.enableAutoInvalidation === undefined) this.config.enableAutoInvalidation = true;
  }

  // Validates key configuration, and sets defaults.
  private validateKey() {
    if (!this.config.key) this.config.key = { separator: DefaultKeySeparator };
    if (this.config.key && this.config.key.separator) this.config.key.separator = DefaultKeySeparator;
  }

  // Validates matcher configuration, and sets defaults.
  private validateMatcher = () => {
    if (!this.config.matcher || !this.config.matcher.length) {
      this.config.matcher = [MatchGET];

      return;
    }

    // Ensures only `GET` matching rules.
    const getter = _.filter(this.config.matcher, { method: HTTPVerbs.GET });
    getter.push(..._.filter(this.config.matcher, { path: MatchAllChar }));

    this.config.matcher = getter;
  };

  // Validates warmer configuration, and sets defaults.
  private validateWarmer = () => {
    const defaultWarmerConfig = {
      baseURL: '',
      batchSize: 10,
      delay: 1000,
      deleteCacheOnFail: false,
      enabled: false,
      headers: {},
      interval: 0,
      intraBatchDelay: 500,
      topN: -1,
      urls: [],
      urlsFromFile: '',
    };

    this.config.warmer = _.merge({}, defaultWarmerConfig, this.config.warmer);

    if (this.config.warmer.enabled) {
      if (this.config.warmer.delay < 1000) {
        throw new Error('Warmer delay should be at least 1 second');
      }

      const interval = this.config.warmer.interval;
      if (interval && (interval < 30000 || interval > 2147483647)) {
        throw new Error('Warmer interval range is from 30 seconds to 24 days 20 hours and 31 minutes');
      }

      if (this.config.warmer.topN < -1) {
        throw new Error('Warmer topN should be at least 1');
      }

      if (!this.config.warmer.urls.length && !this.config.warmer.urlsFromFile) {
        throw new Error('Warmer URLs or URLs from file should be specified');
      }

      if (this.config.warmer.urlsFromFile) {
        const resolvedPath = path.resolve(this.config.warmer.urlsFromFile);

        //////
        // JSON loader, and parser.
        //
        // TODO: Extract from here.
        //////

        if (resolvedPath.includes('.json')) {
          // Import file.
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const content = JSON.parse(fs.readFileSync(this.config.warmer.urlsFromFile, 'utf-8'));

          // Throw error if file is not an array of strings.
          if (
            !Array.isArray(content) ||
            content.length < 1 ||
            !_.isString(content[0])
          ) throw new Error('Warmer urlsFromFile should be an array of strings');

          const parsedURLs = content.map(u => {
            // NOTE: `http://localhost:3000/` is not being used, it's specified
            // because URL constructor requires a base.
            const parsedURL = new URL(u, 'http://localhost:3000');

            const warmerURL = { path: MassagePath(parsedURL.pathname) } as WarmerURL;

            if (parsedURL.search) warmerURL.queryParams = Object.fromEntries(OrderQueryParamsFromURL(parsedURL));

            return warmerURL;
          });

          // Merges with the manual URLs. `Set` ensures uniqueness.
          this.config.warmer.urls = Array.from(new Set([...this.config.warmer.urls, ...parsedURLs]));
        }
      }
    }
  };

  // Sends `data` with `200` (`OK`), and sets the `DataSource` header.
  private sendResponseAsJSON(data: any, res: Response) {
    SetDataSourceHeader(res, DataSource.CACHER);

    return res.status(HTTPStatusCodes.OK).json(data);
  }

  // Allows to directly interact with storage engine.
  public getStorage(): IStorage {
    return this.config.storage;
  }

  // Build cache key. Deconstructs URL, order QP, and rebuilds it producing
  // consistent keys.
  public buildKey(req: Request): string {
    let key = MassageRequestPath(req);

    //////
    // Ordered query params (QP).
    //////

    // NOTE: Only `req.originalUrl` produces consistent, and comparable path.
    // `req.path` is unreliable because `req.baseURL` is not included under
    // certain conditions.
    const parsedURL = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);

    if (parsedURL.search) key = `${key}?${OrderQueryParamsFromURL(parsedURL).toString()}`;

    // Should allow to specify a custom key generator.
    if (this.config.key.generator) key = this.config.key.generator(req);

    LoggerFactory('key')(`Cache key is "${key}"`);

    return key;
  }

  // Retrieves the cached response.
  public async getCache(req: Request, next: NextFunction) {
    //////
    // Builds cache key.
    //////

    const key = this.buildKey(req);

    //////
    // Where the party begins...
    //////

    try {
      return await this.config.storage.get(key);
    } catch (error) {
      return ErrorHandler(error, next);
    }
  }

  // Caches response.
  public async setCache(data: any, req: Request, res: Response, next: NextFunction) {
    const cacheControl = req.header(CacheControl.CACHE_CONTROL);

    //////
    // Builds cache key.
    //////

    const key = this.buildKey(req);

    //////
    // TTL per-request.
    //////

    let ttl: number;

    if (cacheControl && cacheControl.includes(CacheControl.MAX_AGE)) {
      const matches = cacheControl.match(/max-age=(\d+)/);
      ttl = matches ? parseInt(matches[1], 10) : -1;
    }

    //////
    // Where the party begins...
    //////

    try {
      this.config.storage.setTopNHit(key);

      const dataSourceHeader = res.getHeader(DataSource.DATASOURCE);

      if (dataSourceHeader && dataSourceHeader !== DataSource.CACHER) {
        return await this.config.storage.set(key, data, ttl);
      }
    } catch (error) {
      return ErrorHandler(error, next);
    }
  }

  // Determines if cache should be invalidated. Conditions to invalidate:
  // - Request method changes data
  // - `delete-cache` directive is set
  //
  // Conditions to not invalidate:
  // - `enableAutoInvalidation` is false
  // - `persist-cache` directive is set
  //
  // NOTE: There's no official standard/cache directive to delete/persist cache.
  // Cacher uses `delete-cache`/`persist-cache` for that.
  // NOTE: `persist-cache` has precedence over `delete-cache`.
  //
  // SEE: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control#directives
  private shouldInvalidateCache(req: Request) {
    const cacheControlHeader = req.header(CacheControl.CACHE_CONTROL);

    let flag = false;

    if (
      req.method == HTTPVerbs.POST ||
      req.method == HTTPVerbs.PUT ||
      req.method == HTTPVerbs.PATCH ||
      req.method == HTTPVerbs.DELETE
    ) {
      // Should allow to enforce cache persistence programatically, or
      // per-request via the custom `persist-cache` directive.
      if (this.config.enableAutoInvalidation === true) flag = true;
      if (cacheControlHeader && cacheControlHeader.includes(CacheControl.DELETE_CACHE)) flag = true;
      if (cacheControlHeader && cacheControlHeader.includes(CacheControl.PERSIST_CACHE)) flag = false;
    }

    return flag;
  }

  // The ExpressJS middleware.
  private middleware(): RequestHandler {
    return async (req: Request, res: Response, next: NextFunction) => {
      const middlewareLogger = LoggerFactory('middleware');

      middlewareLogger(`Request incoming to cache "${req.originalUrl}"`);

      // Should inject Cacher, making it available into the request chain.
      //
      // SEE: https://expressjs.com/en/api.html#res.locals
      res.locals[PackageName] = this;

      // "Default" data source is `live` until otherwise specified.
      const cacheControlHeader = req.header(CacheControl.CACHE_CONTROL);
      SetDataSourceHeader(res, DataSource.LIVE);

      middlewareLogger(`Setting "DataSource" header to it's default value "${DataSource.LIVE}"`);

      // Determines if should invalidate cache.
      if (this.shouldInvalidateCache(req)) {
        try {
          await this.config.storage.delete(this.buildKey(req));

          middlewareLogger('Cache entry invalidated');
        } catch (error) {
          return ErrorHandler(error, next);
        }
      }

      //////
      // Conditions to cache a response.
      //////

      const reqMatches = Matches(this.config.matcher, req);

      if (reqMatches) {
        // Register post-response listener.
        this.postResponseListeners(req, res, next);

        // Monkey patch `res.send` to be able to cache response.
        //
        // SEE: `ResponseInterceptor` documentation for more details.
        res['send'] = ResponseInterceptor(res, res.send) as any;
      } else {
        middlewareLogger(`Cacher isn't caching the response => Matches: ${reqMatches}`);
      }

      //////
      // Conditions to don't respond with a cached response.
      //////

      const dataSourceHeader = req.header(DataSource.DATASOURCE);

      if (
        dataSourceHeader === DataSource.LIVE ||
        cacheControlHeader && cacheControlHeader.includes(CacheControl.NO_CACHE) ||
        !reqMatches
      ) {
        middlewareLogger(`Cacher isn't returning a cached response => DataSource header: ${dataSourceHeader}. Cache-Control header: ${cacheControlHeader}. Matches: ${reqMatches}`);

        return next();
      }

      //////
      // Return with a cached response.
      //////

      try {
        const cachedResponse = await this.getCache(req, next);

        // Should only retrieve TTL if there is a cached response.
        if (!cachedResponse) return next();
        if (cachedResponse.ttl && cachedResponse.ttl > 0) res.set(CacheControl.CACHE_CONTROL, `${CacheControl.MAX_AGE}=${cachedResponse.ttl}`);

        middlewareLogger('Cache successfully retrieved');

        return this.sendResponseAsJSON(cachedResponse.data, res);
      } catch (error) {
        return ErrorHandler(error, next);
      }
    };
  }

  // Register post-response listeners.
  private postResponseListeners(req: Request, res: Response, next: NextFunction) {
    const postResponseLogger = LoggerFactory('postResponse');

    const afterResponse = () => {
      res.removeListener('finish', afterResponse);
      res.removeListener('close', afterResponse);

      // Don't cache non-2xx responses.
      if (res.statusCode < HTTPStatusCodes.OK || res.statusCode >= HTTPStatusCodes.MULTIPLE_CHOICES) {
        postResponseLogger('Not caching, request failed', req.originalUrl, res.statusCode);

        return;
      };

      // Should respect standard `no-store` header.
      const cacheControlHeader = req.header(CacheControl.CACHE_CONTROL);
      if (cacheControlHeader && cacheControlHeader.includes(CacheControl.NO_STORE)) {
        postResponseLogger('Not caching, no-store set');

        return;
      };

      // Added by monkey patch.
      const data = res['body'];

      // Should only cache, if there's `data`.
      //
      // NOTE: Need to resolve the promise because listeners are event-base, not
      // async/await "friendly".
      if (data) this.setCache(data, req, res, next).catch(error => {
        // At this point the response was already send, nothing can be done
        // beyond make the event observable (log).
        console.error(`Failed to cache: ${req.url} = ${data}. ${error}`);
      });

      postResponseLogger('Successfully cached response');
    };

    res.on('finish', afterResponse);
    res.on('close', afterResponse);
  }

  // Warms the cache. Request data sources:
  // - Manual (`this.config.warmer.urls`)
  // - Automatic (top N)
  //
  // TODO: Update cache metadata when a cache is warmed.
  private Warmer() {
    // Should wait `delay` milliseconds before starting the warmup.
    setTimeout(() => {
      // Should run warmup every `interval` milliseconds, or only once.
      if (this.config.warmer.interval) {
        setInterval(() => {
          Process(this.config, this.config.storage);
        }, this.config.warmer.interval);
      } else {
        Process(this.config, this.config.storage);
      }
    }, this.config.warmer.delay);
  }
}
