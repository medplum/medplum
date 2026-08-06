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

test('Query string with repeated params', () => {
  const router = new Router();
  router.add('GET', '/foo', () => 'get');

  // A single occurrence is a string; repeats collapse into an array in order, interleaving with
  // other params and preserving duplicate values.
  expect(router.find('GET', '/foo?a=1&a=2')?.query).toEqual({ a: ['1', '2'] });
  expect(router.find('GET', '/foo?a=1&b=2&a=3&a=4')?.query).toEqual({ a: ['1', '3', '4'], b: '2' });
  expect(router.find('GET', '/foo?a=1&a=1')?.query).toEqual({ a: ['1', '1'] });
});
