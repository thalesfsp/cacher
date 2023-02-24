import { Request } from 'express';
import { IStorage } from './storage';

// An optional function evaluated, and used everytime a key is built.
//
// NOTE: Only `req.originalUrl` produces consistent, and comparable path.
// `req.path` is unreliable because `req.baseURL` is not included under
// certain conditions.
export type KeyGeneratorFunction = (req: Request) => string;

// Key configuration.
export type KeyConfig = {
  // Evaluated, and used every time a key is built.
  //
  // NOTE: Only `req.originalUrl` produces consistent, and comparable path.
  // `req.path` is unreliable because `req.baseURL` is not included under
  // certain conditions.
  generator?: KeyGeneratorFunction;

  // Separator between key components. Default to `::`.
  separator?: string,
};

// Request matching rules.
export type Match = {
  // An object with valid headers, e.g: {x: 'y', z: 'w'}.
  headers?: Record<string, any>;

  // Any valid HTTP verb, e.g.: `POST`.
  //
  // NOTE: It's case sensitive.
  method: string;

  // Any valid URL path, e.g.: `/api/v1/test`.
  //
  // NOTE: It's case sensitive.
  path: string;

  // An object with valid query params, e.g: {user: 'john', city: 'orlando'}.
  queryParams?: Record<string, any>;
};

// Warmer's file datasource
export type Filepath = string;

// Swagger file.
export type APIFilepath = Filepath;

// `.har` file.
export type HARFilepath = Filepath;

// `.json` file.
export type JSONFilepath = Filepath;

// Warmer URL specification. Used by the cache warmer.
export type WarmerURL = Pick<Match, 'path' | 'queryParams'>;

// Cache warmer configuration.
export type WarmerConfig = {
  // Base URL to be used when replaying the cache.
  baseURL: string,

  // How many entries to fetch from the cache. Default is `10`.
  batchSize?: number,

  // How long the warmer should wait before warming the cache.
  //
  // NOTE: In milliseconds.
  delay?: number,

  // Delete the cache entry - if any, if request fails. Default is `false`.
  deleteCacheOnFail?: boolean,

  // If should warm the cache, or not. Default is `false`.
  enabled: boolean;

  // Headers to be sent with every request.
  headers?: Record<string, string | number | boolean>,

  // How often the warmer should run.
  //
  // NOTE: In milliseconds.
  // NOTE: Max is `2147483647` (32-bit signed interger).
  interval?: number,

  // Between batch call delay so it doesn't overload/spam the storage.
  //
  // NOTE: In milliseconds.
  intraBatchDelay?: number,

  // How many entries to retrieve from storage to be replayed. If not specified,
  // or set to `0`, disables top N retrieval. If set to `-1`, retrieves all.
  topN?: number,

  // List of URLs to be warmed, loaded from a file.
  //
  // NOTE: If specified, and `urls`, the final result is the deduplicated merge
  // of both.
  urlsFromFile?: APIFilepath | HARFilepath | JSONFilepath,

  // List of URLs to be warmed.
  urls: WarmerURL[],
};

// Cacher configuration.
export type Config = {
  // If enabled, any call which changes data (non-`GET`) will invalidate (del)
  // the respective cache entry. Default to `true`.
  enableAutoInvalidation?: boolean,

  // Key configuration.
  key?: KeyConfig,

  // Matcher configuration.
  matcher?: Match[];

  // Storage configuration.
  storage: IStorage;

  // Cache warmer configuration.
  warmer?: WarmerConfig,
};
