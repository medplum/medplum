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
