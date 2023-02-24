import { Config, Match } from './types';
import { DataSource, HTTPStatusCodes, MatchAllChar, PackageName } from './shared';
import { HttpException } from './http.exception';
import { NextFunction, Request, Response } from 'express';
import debug from 'debug';

// Lowercases the path, and removes last `/` producing consistent, and
// comparable URL params.
export const MassagePath = (path: string): string => {
  let requestFinalPath = path.toLowerCase();

  if (requestFinalPath !== '/' && requestFinalPath.endsWith('/')) {
    requestFinalPath = requestFinalPath.slice(0, -1);
  }

  return requestFinalPath;
};

// Lowercases the path, and removes last `/` producing consistent, and
// comparable URL params from a request.
export const MassageRequestPath = (req: Request): string => {
  // NOTE: Only `req.originalUrl` produces consistent, and comparable path.
  // `req.path` is unreliable because `req.baseURL` is not included under
  // certain conditions.
  const parsedURL = new URL(req.originalUrl, `${req.protocol}://${req.headers.host}`);

  return MassagePath(parsedURL.pathname);
};

// Matches evaluates if a request should be considered a match.
export const Matches = (matchers: Match[], req: Request): boolean => {
  // If nothing is specified, it means "match everything".
  if (!matchers || !matchers.length) return true;

  const matchesAccumulator: Array<boolean> = [];

  matchers.forEach(match => {
    let matches = true;
    const massagedPath = MassageRequestPath(req);

    if (match.method && match.method !== MatchAllChar && match.method !== req.method) matches = false;
    if (match.path && match.path !== MatchAllChar) {
      if (massagedPath !== match.path) matches = false;
      if (match.path.includes(MatchAllChar) && massagedPath.includes(match.path.replace(MatchAllChar, ''))) matches = true;
      if (massagedPath === '/' && massagedPath !== match.path) matches = false;
    }

    if (match.headers && req.headers) {
      Object.keys(match.headers).forEach(header => {
        if (!req.headers[header]) matches = false;
      });
    }

    if (match.queryParams && req.query) {
      Object.keys(match.queryParams).forEach(queryParam => {
        if (!req.query[queryParam]) matches = false;
      });
    }

    matchesAccumulator.push(matches);
  });

  // If any rule matches, it's a match.
  return matchesAccumulator.includes(true);
};

// HTTP error handler. Will log a message, and return a HTTP exception.
export const ErrorHandler = (error: any, next: NextFunction) => {
  console.error(error);

  next(new HttpException(
    error.status || HTTPStatusCodes.INTERNAL_SERVER_ERROR,
    `${PackageName} error. ${error}`,
  ));
};

// Interceptor function used to monkey patch the `res.send` until it is invoked
// then restores the original `send` function and invokes that to finalize the
// `req`/`res` chain. TL;DR: You can't properly/elegantly intercept the response
// body.
export const ResponseInterceptor = (res, send) => (data) => {
  res.body = data;
  res.send = send;
  res.send(data);
};

// Sets the DataSource header to indicate that the response was served from the
// cache, or not.
//
// NOTE: Best practice is to drop the X-XYZ style.
// SEE: https://datatracker.ietf.org/doc/html/rfc6648.html#section-3
export const SetDataSourceHeader = (res: Response, source: DataSource) => {
  res.setHeader('DataSource', source);
};

// Returns an ordered query params object from an object.
export const OrderQueryParamsFromObject = (queryParams: any) => {
  const _queryParams = {};

  Object.keys(queryParams).sort().forEach((queryParam) => {
    _queryParams[queryParam] = queryParams[queryParam];
  });

  return _queryParams;
};

// Returns an ordered query params object (URLSearchParams) from an URL.
export const OrderQueryParamsFromURL = (u: URL) => {
  u.searchParams.sort();

  return new URLSearchParams(u.searchParams);
};

// Build cache key based on an URL. Deconstructs URL, order QP, and rebuilds
// it producing.
export const BuildKeyByURL = (config: Config, u: string) => {
  // NOTE: Only `req.originalUrl` produces consistent, and comparable path.
  // `req.path` is unreliable because `req.baseURL` is not included under
  // certain conditions. `http://localhost:3000/` is not being used, it's
  // specified because URL constructor requires a base.
  const parsedURL = new URL(u, 'http://localhost:3000');

  let key = MassagePath(parsedURL.pathname);

  //////
  // Ordered query params (QP).
  //////

  if (parsedURL.search) key = `${key}?${OrderQueryParamsFromURL(parsedURL).toString()}`;

  return key;
};

// Build cache key based on a request. Deconstructs URL, order QP, and rebuilds
// it producing.
export const BuildKeyByReq = (config: Config, req: Request) => {
  let key = BuildKeyByURL(config, req.originalUrl);

  // Should allow to specify a custom key generator.
  if (config.key.generator) key = config.key.generator(req);

  return key;
};

// Compares two strings, lowercasing both.
export const CompareStrings = (a: string, b: string): boolean => {
  return a.toLowerCase() === b.toLowerCase();
};


// Returns a namespaced logger.
export const LoggerFactory = (namespace: string) => {
  return debug(`cacher:${namespace}`);
};
