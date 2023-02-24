import { HTTPStatusCodes } from './shared';
import Cacher, { RedisStorage } from './index';
import express from 'express';

//////
// Const, and vars.
//////

const port = 3000;

//////
// Basic ExpressJS server.
//////

const app = express();

//////
// Middleware setup.
//////

app.use(new Cacher({
  storage: new RedisStorage({
    connectionInfo: {
      db: Number(process.env.CACHE_STORAGE_DB || '0'),
      host: process.env.CACHE_STORAGE_HOST || 'localhost',
      port: process.env.CACHE_STORAGE_PORT || '6379',
    },
  }),
  matcher: [
    // Caches everything under /api/v1.
    //
    // NOTE: If no matcher is specified, all `GET`-requests will be cached.
    { method: 'GET', path: '/api/v1/*' },
  ],
  warmer: {
    // Base URL to be used when replaying the cache.
    baseURL: `http://localhost:${port}`,

    // How long the warmer should wait before warming the cache.
    //
    // NOTE: In milliseconds.
    delay: 1000,

    // If should warm the cache, or not. Default is `false`.
    enabled: true,

    // How often the warmer should run.
    //
    // NOTE: In milliseconds.
    // NOTE: Max is `2147483647` (32-bit signed interger).
    interval: 30000,

    // How many entries to retrieve from storage to be replayed. If not specified,
    // or set to `0`, disables top N retrieval. If set to `-1`, retrieves all.
    topN: 3,

    // Replay the following requests, in batches, in "parallel".
    urls: [{ path: '/api/v1/user', queryParams: { year: 200 } }],
  },
}) as any);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//////
// Routes.
//////

// Retrieves a specific user.
//
// NOTE: First call will be "live data", subsequent calls the datasource will be
// the cache.
app.get('/api/v1/user/:id', (req, res) => {
  res.status(HTTPStatusCodes.OK).json({
    method: req.method,
    params: req.params,
    path: req.path,
    query: req.query,
    url: req.url,
  });
});

// Retrieves all users.
//
// NOTE: First call will be "live data", subsequent calls the datasource will be
// the cache.
app.get('/api/v1/user', (req, res) => {
  res.status(HTTPStatusCodes.OK).json({
    method: req.method,
    path: req.path,
    query: req.query,
    url: req.url,
  });
});

// As `PUT` changes data, it'll automatically invalidate the respective cache.
app.put('/api/v1/user', (req, res) => {
  res.sendStatus(HTTPStatusCodes.NO_CONTENT);
});

// As `POST` changes data, it'll automatically invalidate the respective cache.
app.post('/api/v1/user', (req, res) => {
  res.sendStatus(HTTPStatusCodes.NO_CONTENT);
});

// As `DELETE` deletes the data, it'll automatically invalidate the respective
// cache.
app.delete('/api/v1/user', (req, res) => {
  res.sendStatus(HTTPStatusCodes.NO_CONTENT);
});

//////
// Starts here.
//////

app.listen(port, () => {
  console.log(`🚀 App listening on the port ${port}!`);
});
