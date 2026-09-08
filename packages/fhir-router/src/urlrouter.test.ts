// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MAX_QUERY_STRING_LENGTH, Router } from './urlrouter';

test('Simple routes', () => {
  const router = new Router();
  router.add('GET', '/foo', () => 'foo');
  router.add('GET', '/bar', () => 'bar');
  expect(router.find('GET', '/foo')).not.toBeUndefined();
  expect(router.find('GET', '/bar')).not.toBeUndefined();
  expect(router.find('GET', '/baz')).toBeUndefined();
});

test('HttpMethod routes', () => {
  const router = new Router();
  router.add('GET', '/foo', () => 'get');
  router.add('POST', '/foo', () => 'post');
  expect(router.find('GET', '/foo')).not.toBeUndefined();
  expect(router.find('POST', '/foo')).not.toBeUndefined();
  expect(router.find('PATCH', '/foo')).toBeUndefined();
});

test('Params', () => {
  const router = new Router();
  router.add('GET', '/foo/:id', () => 'get');
  expect(router.find('GET', '/foo/1')).toMatchObject({ params: { id: '1' } });
  expect(router.find('GET', '/foo/2')).toMatchObject({ params: { id: '2' } });
});

describe('Query string', () => {
  const router = new Router();
  router.add('GET', '/foo', () => 'get');

  test('No query string', () => {
    expect(router.find('GET', '/foo')?.query).toBeUndefined();
  });

  test('Single value', () => {
    expect(router.find('GET', '/foo?a=1')?.query).toEqual({ a: '1' });
  });

  test('Repeated param collects values in order', () => {
    expect(router.find('GET', '/foo?a=1&a=2&b=3')?.query).toEqual({ a: ['1', '2'], b: '3' });
  });

  test('Interleaved repeated params', () => {
    expect(router.find('GET', '/foo?a=1&b=2&a=3&a=4')?.query).toEqual({ a: ['1', '3', '4'], b: '2' });
  });

  test('Percent-encoded values', () => {
    expect(router.find('GET', '/foo?x=%20&y=a%26b')?.query).toEqual({ x: ' ', y: 'a&b' });
  });

  test('Does not pollute the prototype', () => {
    const query = router.find('GET', '/foo?__proto__=polluted')?.query as Record<string, string>;
    expect(Object.getPrototypeOf(query)).toBeNull();
    expect(Object.entries(query)).toEqual([['__proto__', 'polluted']]);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test('Accepts a query string at the maximum length', () => {
    const query = 'a=' + 'x'.repeat(MAX_QUERY_STRING_LENGTH - 2);
    expect(query.length).toBe(MAX_QUERY_STRING_LENGTH);
    expect(router.find('GET', `/foo?${query}`)?.query).toBeDefined();
  });

  test('Rejects a query string over the maximum length', () => {
    const query = 'a=' + 'x'.repeat(MAX_QUERY_STRING_LENGTH - 1);
    expect(query.length).toBe(MAX_QUERY_STRING_LENGTH + 1);
    expect(() => router.find('GET', `/foo?${query}`)).toThrow(
      `Query string exceeds maximum length of ${MAX_QUERY_STRING_LENGTH} characters`
    );
  });

  test('Long path with no query string is allowed', () => {
    const longRouter = new Router();
    longRouter.add('GET', '/:id', () => 'get');
    expect(longRouter.find('GET', '/' + 'x'.repeat(MAX_QUERY_STRING_LENGTH + 100))).toBeDefined();
  });

  test('Many duplicate params parse in linear time', () => {
    // Kept under MAX_QUERY_STRING_LENGTH so this exercises parsing rather than the length guard.
    const count = 8000;
    const queryString = Array.from({ length: count }, (_, i) => `i=${i}`).join('&');
    expect(queryString.length).toBeLessThan(MAX_QUERY_STRING_LENGTH);

    const start = process.hrtime.bigint();
    const query = router.find('GET', `/foo?${queryString}`)?.query;
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    expect((query?.i as string[]).length).toBe(count);
    // Guards against a quadratic regression: an O(n^2) parse takes several hundred ms here.
    expect(elapsedMs).toBeLessThan(250);
  });
});
