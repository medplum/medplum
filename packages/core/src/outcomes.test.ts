import {
  accepted,
  allOk,
  assertOk,
  badRequest,
  created,
  forbidden,
  getStatus,
  gone,
  isAccepted,
  isGone,
  isNotFound,
  isOk,
  isOperationOutcome,
  normalizeErrorString,
  notFound,
  notModified,
  operationOutcomeToString,
  tooManyRequests,
  unauthorized,
} from './outcomes';

describe('Outcomes', () => {
  test('OK', () => {
    expect(isOk(allOk)).toBe(true);
    expect(isOk(created)).toBe(true);
    expect(isAccepted(created)).toBe(false);
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

  test('Accepted', () => {
    expect(isOk(accepted('https://example.com'))).toBe(true);
    expect(isAccepted(accepted('https://example.com'))).toBe(true);
    expect(accepted('https://example.com')).toMatchObject({
      resourceType: 'OperationOutcome',
      id: 'accepted',
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: {
            text: 'Accepted',
          },
          diagnostics: 'https://example.com',
        },
      ],
    });
  });

  test('Bad Request', () => {
    expect(isOk(badRequest('bad'))).toBe(false);
    expect(badRequest('bad', 'bad').issue?.[0]?.expression?.[0]).toBe('bad');
  });

  test('Status', () => {
    expect(getStatus(allOk)).toBe(200);
    expect(getStatus(created)).toBe(201);
    expect(getStatus(accepted('https://example.com'))).toBe(202);
    expect(getStatus(notModified)).toBe(304);
    expect(getStatus(unauthorized)).toBe(401);
    expect(getStatus(forbidden)).toBe(403);
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

  test('isOperationOutcome', () => {
    expect(isOperationOutcome(undefined)).toBe(false);
    expect(isOperationOutcome(null)).toBe(false);
    expect(isOperationOutcome('foo')).toBe(false);
    expect(isOperationOutcome({ resourceType: 'Patient' })).toBe(false);
    expect(isOperationOutcome({ resourceType: 'OperationOutcome' })).toBe(true);
  });

  test('operationOutcomeToString', () => {
    expect(operationOutcomeToString({ resourceType: 'OperationOutcome' })).toEqual('Unknown error');
    expect(
      operationOutcomeToString({ resourceType: 'OperationOutcome', issue: [{ details: { text: 'foo' } }] })
    ).toEqual('foo');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'foo' }, expression: ['bar'] }],
      })
    ).toEqual('foo (bar)');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [
          { details: { text: 'error1' }, expression: ['expr1'] },
          { details: { text: 'error2' }, expression: ['expr2'] },
        ],
      })
    ).toEqual('error1 (expr1); error2 (expr2)');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'processing',
            diagnostics: 'Supplied Patient is unknown.',
          },
        ],
      })
    ).toEqual('Supplied Patient is unknown.');
  });
});
