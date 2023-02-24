import { GetResponse, Storage, StorageConfig } from './storage';
import { MatchAllChar } from './shared';
import Redis, { RedisOptions } from 'ioredis';
import { LoggerFactory } from './utils';

// Filter all character.
export const FilterAllChar = MatchAllChar;

// Redis storage engine.
export class RedisStorage extends Storage {
  // Storage client.
  protected client: any;

  // Key which will hold the top N requests.
  private cacheHitsZSetName = 'cache:hits';

  constructor(storageConfig?: StorageConfig) {
    // Default configuration.
    //
    // NOTE: Validation isn't required here, it happens in the abstract class.
    if (!storageConfig) {
      storageConfig = {
        connectionInfo: {
          host: 'localhost',
          port: 6379,
          db: 0,
        } as RedisOptions,

        ttl: 0,
      }
    }

    super('redis', storageConfig);

    this.client = this.setupClient();

    LoggerFactory('redis')('Redis storage engine initialized');
  }

  // Sets up the client.
  //
  // NOTE: Call this in the constructor consuming `storageConfig`. It stores the
  // setup client in the `client` property.
  protected setupClient() {
    return new Redis(this.storageConfig.connectionInfo);
  }

  // Delete all cache entries.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  public async clean(filter = FilterAllChar) {
    const keys = await this.client.keys(filter);

    if (keys.length) await this.client.del(keys);
  }

  // Deletes a cache entry.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  public async delete(key: string) {
    await this.client.del(key);
  }

  // Retrieves a cache entry, and the TTL - if supported by the engine.
  public async get(key: string): Promise<GetResponse> {
    const cachedResponse = await this.client.get(key);

    // Do nothin if the response is not cached.
    if (!cachedResponse) return;

    // Get expiration time for the key.
    const ttl = await this.client.ttl(key);

    const response = {
      data: JSON.parse(cachedResponse),
    } as GetResponse;

    if (ttl) response.ttl = ttl;

    return response;
  }

  // How many entries to retrieve from storage to be replayed. If not specified,
  // or set to `0`, disables top N retrieval. If set to `-1`, retrieves all.
  public async getTopNHits(n: number): Promise<[]> {
    return this.client.zrevrange(this.cacheHitsZSetName, 0, (n === -1) ? -1 : n - 1);
  }

  // Retrieves stored keys.
  //
  // WARN: Dangerous! Know what you are doing!
  public async listKeys(filter = FilterAllChar): Promise<any> {
    return this.client.keys(filter);
  }

  // Sets a cache entry.
  //
  // If TTL is supported, the following should be the precedence order:
  // 1. Global
  // 2. Per call
  //
  // NOTE: It automatically sets/updates the cache hit counter.
  // NOTE: `data` is automatically JSON.stringified.
  public async set(key: string, data: any, ttl = this.storageConfig.ttl) {
    // JSON.stringify only if data isn't already a string.
    if (typeof data !== 'string') data = JSON.stringify(data);

    if (ttl) {
      await this.client.setex(key, ttl, data);
    } else {
      await this.client.set(key, data);
    }
  }

  // Add key to top N. Depending on the storage engine, this may be a no-op, or
  // increment some counter, or adding the key to something (table, doc, etc).
  // It's up to the storage engine implementator to decide what to do.
  public async setTopNHit(key: string) {
    // Increments key in the sorted set.
    await this.client.zincrby(this.cacheHitsZSetName, 1, key);
  }
}
