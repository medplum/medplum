import { gone, isGone } from '.';
import { allOk, assertOk, badRequest, created, getStatus, isNotFound, isOk, notFound, notModified } from './outcomes';

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
    expect(getStatus(notFound)).toBe(404);
    expect(getStatus(gone)).toBe(410);
    expect(getStatus(badRequest('bad'))).toBe(400);
  });

  test('Assert OK', () => {
    expect(() => assertOk(allOk)).not.toThrow();
    expect(() => assertOk(notFound)).toThrowError('Not found');
  });

});
