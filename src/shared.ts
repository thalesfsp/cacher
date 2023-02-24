import { Match } from './types';

export const PackageName = 'cacher';

// HTTP verbs enum.
export enum HTTPVerbs {
  DELETE = 'DELETE',
  GET = 'GET',
  PATCH = 'PATCH',
  POST = 'POST',
  PUT = 'PUT',
}

// HTTP status codes.
export enum HTTPStatusCodes {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  MULTIPLE_CHOICES = 300,
  INTERNAL_SERVER_ERROR = 500,
}

// Data source.
export enum DataSource {
  CACHER = 'cacher',
  DATASOURCE = 'datasource',
  LIVE = 'live',
}

// Cache control directives.
export enum CacheControl {
  CACHE_CONTROL = 'cache-control',
  DELETE_CACHE = 'delete-cache',
  MAX_AGE = 'max-age',
  NO_CACHE = 'no-cache',
  NO_STORE = 'no-store',
  PERSIST_CACHE = 'persist-cache',
}

// Match all character.
export const MatchAllChar = '*';

// Matches all GET requests independent of the path.
export const MatchGET: Match = { method: HTTPVerbs.GET, path: MatchAllChar };

// Default key separator.
export const DefaultKeySeparator = '::';
