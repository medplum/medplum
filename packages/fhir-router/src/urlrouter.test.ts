// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Router } from './urlrouter';

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

  test('Many duplicate params parse in linear time', () => {
    const count = 10000;
    const path = '/foo?' + Array.from({ length: count }, (_, i) => `identifier=val${i}`).join('&');

    const start = process.hrtime.bigint();
    const query = router.find('GET', path)?.query;
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    expect((query?.identifier as string[]).length).toBe(count);
    // Guards against a quadratic regression: an O(n^2) parse takes ~700ms for this input.
    expect(elapsedMs).toBeLessThan(250);
  });
});
