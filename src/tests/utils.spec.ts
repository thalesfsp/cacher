import { HTTPVerbs, MatchAllChar } from '../shared';
import { Matches } from '../utils';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getFunc = (name: string): string | undefined => 'localhost:3000';

// TODO: Fix tests.
xdescribe('Testing Cacher matcher', () => {
  it('should work - matches method, and path', () => {
    expect(Matches(
      [{ method: HTTPVerbs.GET, path: '/api/v1/sales' }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any)).toBe(true);
  });

  it('should work - matches because of "all", with more rules', () => {
    expect(Matches(
      [
        { method: HTTPVerbs.POST, path: '/api/v1/growth' },
        { method: MatchAllChar, path: MatchAllChar },
      ],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any
    )).toBe(true);
  });

  it('should work - matches partial "all" (method), with more rules', () => {
    expect(Matches(
      [
        { method: HTTPVerbs.POST, path: '/api/v1/growth' },
        { method: MatchAllChar, path: '/api/v1/sales' },
      ],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any
    )).toBe(true);
  });

  it('should work - matches partial "all" (path), with more rules', () => {
    expect(Matches(
      [
        { method: HTTPVerbs.POST, path: '/api/v1/growth' },
        { method: HTTPVerbs.GET, path: MatchAllChar },
      ],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any
    )).toBe(true);
  });

  it('should work - matches because of "all"', () => {
    expect(Matches(
      [{ method: MatchAllChar, path: MatchAllChar }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any,
    )).toBe(true);
  });

  it('should work - matches query params', () => {
    const queryParams = { user: 'john', city: 'orland' };

    expect(Matches(
      [{ method: HTTPVerbs.GET, path: '/api/v1/sales', queryParams }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales', queryParams } as any)).toBe(true);
  });

  it('should work - matches headers', () => {
    const headers = { x: 'y', z: 'w' };

    expect(Matches(
      [{ method: HTTPVerbs.GET, path: '/api/v1/sales', headers }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales', headers } as any)).toBe(true);
  });

  it('should work - matches query params and headers', () => {
    const queryParams = { user: 'john', city: 'orland' };
    const headers = { x: 'y', z: 'w' };

    expect(Matches(
      [{ method: HTTPVerbs.GET, path: '/api/v1/sales', queryParams, headers }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales', queryParams, headers } as any)).toBe(true);
  });

  it('should not match - method, and path', () => {
    expect(Matches(
      [{ method: HTTPVerbs.POST, path: '/api/v1/growth' }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any,
    )).toBe(false);
  });

  it('should not match - query params not matching', () => {
    const queryParams = { user: 'john', city: 'orland' };

    expect(Matches(
      [{ method: HTTPVerbs.POST, path: '/api/v1/sales', queryParams }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales', query: { 'user': 'peter' } } as any,
    )).toBe(false);
  });

  it('should not match - query params missing on request but specified', () => {
    const queryParams = { user: 'john', city: 'orland' };

    expect(Matches(
      [{ method: HTTPVerbs.POST, path: '/api/v1/sales', queryParams }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any,
    )).toBe(false);
  });

  it('should not match - headers not matching', () => {
    const headers = { x: 'y', z: 'w' };

    expect(Matches(
      [{ method: HTTPVerbs.POST, path: '/api/v1/sales', headers }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales', headers: { 'x': 'a' } } as any,
    )).toBe(false);
  });

  it('should not match - headers missing on request but specified', () => {
    const headers = { user: 'john', city: 'orland' };

    expect(Matches(
      [{ method: HTTPVerbs.POST, path: '/api/v1/sales', headers }],
      { method: HTTPVerbs.GET, path: '/api/v1/sales' } as any,
    )).toBe(false);
  });
});
