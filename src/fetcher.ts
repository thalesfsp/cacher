import _ from 'lodash';
import { BuildKeyByURL, CompareStrings, LoggerFactory, OrderQueryParamsFromObject } from './utils';
import { CacheControl, HTTPVerbs } from './shared';
import { Config } from './types';
import { IStorage } from './storage';
import axios, { AxiosError } from 'axios';

const fetcherLogger = LoggerFactory('fetcher');

// In case of an error, prints that, also notifies about cache deletion.
const printDeletingMessage = (result: any, key: string) => {
  const reason = result.reason;

  console.error(`Failed to cache request ${reason.config.method.toUpperCase()} ${reason.config.url} => ${reason.response.status}
Deleting respective cache entry key=${key}
It could be a glitch, if the error persists, action is required.`);
};

// Process URLs (manual, and top N - if any), and call FetchURLs.
export const Process = (config: Config, storage: IStorage) => {
  let finalURLs = [];

  // Should be able to manually specify URLs.
  config.warmer.urls.forEach((url) => {
    let finalURL = url.path;

    // Should only add query params if any. Query params should be sorted.
    if (url.queryParams) finalURL += `?${new URLSearchParams(OrderQueryParamsFromObject(url.queryParams)).toString()}`;

    finalURLs.push(finalURL);
  });

  fetcherLogger('Processed manual URLs', finalURLs);

  // Should be able to disable top N retrieval. Should be able to specify
  // everything.
  if (config.warmer.topN || config.warmer.topN !== 0) {
    let topNURLs = [];

    config.storage.getTopNHits(config.warmer.topN).then(data => {
      topNURLs = data;
    }).catch(err => {
      console.error(err);
    }).finally(() => {
      fetcherLogger('Top N retrieved', topNURLs);

      // Merges with the manual URLs. `Set` ensures uniqueness.
      if (topNURLs.length > 0) finalURLs = Array.from(new Set([...finalURLs, ...topNURLs]));

      fetcherLogger('URLs merged', finalURLs);

      // Party time!
      return FetchURLs(config, finalURLs, storage);
    });
  } else {
    // Party time!
    return FetchURLs(config, finalURLs, storage);
  }
};

// Fetch URLs.
export const FetchURLs = (config: Config, urls: string[], storage: IStorage) => {
  fetcherLogger('Fetching URLs', urls);

  // Should be able to specify batch size.
  const batchSize = config.warmer.batchSize;

  _.chunk(urls, batchSize).forEach((batch, index) => {
    // Should be able to specify intra-batch delay.
    setTimeout(() => {
      // Should refresh the cache even if the cache is already populated.
      const reqOptions = { headers: { [CacheControl.CACHE_CONTROL]: CacheControl.NO_CACHE } };

      // Should allows to specify headers.
      if (config.warmer.headers) reqOptions.headers = _.merge({}, reqOptions.headers, config.warmer.headers);

      const axiosBatch = batch.map(url => axios.get(config.warmer.baseURL + url, reqOptions));

      fetcherLogger(`Fetching URLs from batch size (${batchSize}):`, batch);

      // Should run the requests in parallel.
      //
      // TODO: Add the ability to delete cache entry if request fails.
      Promise.allSettled(axiosBatch).then((results) => {
        results.forEach((result) => {
          if (
            result.status === 'rejected' &&
            result.reason instanceof AxiosError &&
            CompareStrings(result.reason.config.method, HTTPVerbs.GET) &&
            result.reason.config.url &&
            config.warmer.deleteCacheOnFail
          ) {
            // Should be able to delete cache entry if request fails.
            //
            // NOTE: It'll NOT delete the URL source (manual, top N, etc).
            const key = BuildKeyByURL(config, result.reason.config.url);

            printDeletingMessage(result, key);

            storage.delete(key).catch(err => console.error(err));
          }
        });
      }).catch(err => console.error(err));
    }, config.warmer.intraBatchDelay * index);
  });
};
