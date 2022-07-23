import {
  accessDenied,
  allOk,
  assertOk,
  badRequest,
  created,
  getStatus,
  gone,
  isGone,
  isNotFound,
  isOk,
  normalizeErrorString,
  notFound,
  notModified,
  tooManyRequests,
} from './outcomes';

describe('Outcomes', () => {
  test('OK', () => {
    expect(isOk(allOk)).toBe(true);
    expect(isOk(created)).toBe(true);
    expect(isNotFound(allOk)).toBe(false);
    expect(isGone(allOk)).toBe(false);
  });

  test('Not Found', () => {
    expect(isOk(notFound)).toBe(false);
    expect(isNotFound(notFound)).toBe(true);
    expect(isGone(notFound)).toBe(false);
  });

  test('Gone', () => {
    expect(isOk(gone)).toBe(false);
    expect(isGone(gone)).toBe(true);
  });

  test('Bad Request', () => {
    expect(isOk(badRequest('bad'))).toBe(false);
    expect(badRequest('bad', 'bad')?.issue?.[0]?.expression?.[0]).toBe('bad');
  });

  test('Status', () => {
    expect(getStatus(allOk)).toBe(200);
    expect(getStatus(created)).toBe(201);
    expect(getStatus(notModified)).toBe(304);
    expect(getStatus(accessDenied)).toBe(403);
    expect(getStatus(notFound)).toBe(404);
    expect(getStatus(gone)).toBe(410);
    expect(getStatus(tooManyRequests)).toBe(429);
    expect(getStatus(badRequest('bad'))).toBe(400);
  });

  test('Assert OK', () => {
    expect(() => assertOk(allOk, { resourceType: 'Patient' })).not.toThrow();
    expect(() => assertOk(notFound, undefined)).toThrowError('Not found');
  });

  test('Normalize error', () => {
    expect(normalizeErrorString(undefined)).toBe('Unknown error');
    expect(normalizeErrorString(null)).toBe('Unknown error');
    expect(normalizeErrorString('')).toBe('Unknown error');
    expect(normalizeErrorString('foo')).toBe('foo');
    expect(normalizeErrorString(new Error('foo'))).toBe('foo');
    expect(normalizeErrorString(badRequest('foo'))).toBe('foo');
    expect(normalizeErrorString({ resourceType: 'OperationOutcome' })).toBe('Unknown error');
    expect(normalizeErrorString({ foo: 'bar' })).toBe('{"foo":"bar"}');
  });
});
