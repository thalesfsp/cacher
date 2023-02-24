//////
// Types.
//////

// A function evaluated, and used everytime a key is built.
export type KeyGeneratorFunction = (params: any) => string;

// GetResponse is the response of a get operation.
export type GetResponse = {
  // The data stored.
  data: any;

  // The TTL of the entry, if supported by the engine.
  ttl?: number;
}

// Storage configuration definition.
export type StorageConfig = {
  // To be used by the storage setup.
  connectionInfo: any;

  // When each entry expires.
  //
  // NOTE: Not all storage engines support this.
  // NOTE: Some engine expect this to be in seconds, others in milliseconds.
  // WARN: Not expiring entries is not recommended!
  ttl?: number;
};

//////
// Interfaces.
//////

// Defines what's a storage engine.
export interface IStorage {
  // Delete all cache entries.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  clean(filter?: string);

  // Deletes a cache entry.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  delete(key: string);

  // Retrieves a cache entry, and the TTL - if supported by the engine.
  get(key: string): Promise<GetResponse>;

  // How many entries to retrieve from storage to be replayed. If not specified,
  // or set to `0`, disables top N retrieval. If set to `-1`, retrieves all.
  getTopNHits(n: number): Promise<[]>;

  // Retrieves stored keys.
  //
  // WARN: Dangerous! Know what you are doing!
  // TODO: filter should be any, not string because some engines expect object
  // like ES, MongoDB, etc.
  listKeys(filter?: string): Promise<any>;

  // Sets a cache entry.
  //
  // If TTL is supported, the following should be the precedence order:
  // 1. Global
  // 2. Per call
  set(key: string, data: any, ttl?: number);

  // Add key to top N. Depending on the storage engine, this may be a no-op, or
  // increment some counter, or adding the key to something (table, doc, etc).
  // It's up to the storage engine implementator to decide what to do.
  setTopNHit(key: string): void;
}

//////
// Classes.
//////

// Storage engine definition.
export abstract class Storage implements IStorage {
  // The storage name.
  protected name: string;

  // The storage configuration.
  protected storageConfig: StorageConfig;

  // Storage client.
  protected abstract client: any;

  constructor(name: string, storageConfig: StorageConfig) {
    this.name = name;

    this.storageConfig = storageConfig;

    this.validateConstructorParams();
  }

  // Validates the constructor params.
  validateConstructorParams() {
    if (!this.name) throw new Error('Storage name is required.');
    if (!this.storageConfig) throw new Error('Storage configuration is required.');

    if (!this.storageConfig.connectionInfo) {
      throw new Error('Storage configuration must have connectionInfo.');
    }

    if (this.storageConfig.ttl && this.storageConfig.ttl < 1) {
      throw new Error('Storage configuration ttl must be greater than 0.');
    }
  }

  // Sets up the client.
  //
  // NOTE: Call this in the constructor consuming `storageConfig`. It stores the
  // setup client in the `client` property.
  protected abstract setupClient(): void;

  // Delete all cache entries.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  abstract clean(filter?: string): void;

  // Deletes a cache entry.
  //
  // WARN: Dangerous! Know what you are doing! It's not up to Cacher to protect
  // against calling this method!
  abstract delete(key: string): void;

  // Retrieves a cache entry, and the TTL - if supported by the engine.
  abstract get(key: string): Promise<GetResponse>;

  // How many entries to retrieve from storage to be replayed. If not specified,
  // or set to `0`, disables top N retrieval. If set to `-1`, retrieves all.
  abstract getTopNHits(n: number): Promise<[]>;

  // Retrieves stored keys.
  //
  // WARN: Dangerous! Know what you are doing!
  abstract listKeys(filter?: string): Promise<any>;

  // Sets a cache entry.
  //
  // If TTL is supported, the following should be the precedence order:
  // 1. Global
  // 2. Per call
  //
  // NOTE: It automatically sets/updates the cache hit counter.
  // NOTE: `data` is automatically JSON.stringified.
  abstract set(key: string, data: any, ttl?: number): void;

  // Add key to top N. Depending on the storage engine, this may be a no-op, or
  // increment some counter, or adding the key to something (table, doc, etc).
  // It's up to the storage engine implementator to decide what to do.
  abstract setTopNHit(key: string): void;
}
