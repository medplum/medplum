import { CodeableConcept, OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import {
  accepted,
  allOk,
  assertOk,
  badRequest,
  conflict,
  created,
  forbidden,
  getStatus,
  gone,
  isAccepted,
  isCreated,
  isError,
  isGone,
  isNotFound,
  isOk,
  isOperationOutcome,
  multipleMatches,
  normalizeErrorString,
  notFound,
  notModified,
  operationOutcomeToString,
  preconditionFailed,
  redirect,
  serverError,
  serverTimeout,
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

  test('Created', () => {
    expect(isCreated(allOk)).toBe(false);
    expect(isCreated(created)).toBe(true);
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

  test('Conflict', () => {
    expect(isOk(conflict('bad'))).toBe(false);
    expect(conflict('bad').issue?.[0]?.details).toMatchObject<CodeableConcept>({ text: 'bad', coding: undefined });
    expect(conflict('bad', 'errcode').issue?.[0]?.details).toMatchObject<CodeableConcept>({
      coding: [{ code: 'errcode' }],
      text: 'bad',
    });
  });

  test('Bad Request', () => {
    expect(isOk(badRequest('bad'))).toBe(false);
    expect(badRequest('bad', 'bad').issue?.[0]?.expression?.[0]).toBe('bad');
  });

  test.each([
    [allOk, 200],
    [created, 201],
    [accepted('https://example.com'), 202],
    [redirect(new URL('http://example.com')), 302],
    [notModified, 304],
    [badRequest('bad'), 400],
    [unauthorized, 401],
    [forbidden, 403],
    [notFound, 404],
    [conflict('bad'), 409],
    [gone, 410],
    [preconditionFailed, 412],
    [multipleMatches, 412],
    [tooManyRequests, 429],
    [serverError(new Error('bad')), 500],
    [serverTimeout(), 504],
  ])('getStatus(%p) == %i', (outcome, expectedStatus) => {
    expect(getStatus(outcome)).toStrictEqual(expectedStatus);
  });

  test('Assert OK', () => {
    expect(() => assertOk(allOk, { resourceType: 'Patient' })).not.toThrow();
    expect(() => assertOk(notFound, undefined)).toThrow('Not found');
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
    expect(normalizeErrorString({ code: 'ERR_INVALID_ARG_TYPE' })).toBe('ERR_INVALID_ARG_TYPE');
  });

  test('isError', () => {
    expect(isError(undefined)).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError('foo')).toBe(false);
    expect(isError({ resourceType: 'Patient' })).toBe(false);
    expect(isError(new Error('foo'))).toBe(true);
    expect(isError(new DOMException('foo'))).toBe(true);
  });

  test('isOperationOutcome', () => {
    expect(isOperationOutcome(undefined)).toBe(false);
    expect(isOperationOutcome(null)).toBe(false);
    expect(isOperationOutcome('foo')).toBe(false);
    expect(isOperationOutcome({ resourceType: 'Patient' })).toBe(false);
    expect(isOperationOutcome({ resourceType: 'OperationOutcome' })).toBe(true);
  });

  test('operationOutcomeToString', () => {
    expect(operationOutcomeToString({ resourceType: 'OperationOutcome' } as OperationOutcome)).toStrictEqual(
      'Unknown error'
    );
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'foo' } } as OperationOutcomeIssue],
      })
    ).toStrictEqual('foo');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'foo' }, expression: ['bar'] } as OperationOutcomeIssue],
      })
    ).toStrictEqual('foo (bar)');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [
          { details: { text: 'error1' }, expression: ['expr1'] } as OperationOutcomeIssue,
          { details: { text: 'error2' }, expression: ['expr2'] } as OperationOutcomeIssue,
        ],
      })
    ).toStrictEqual('error1 (expr1); error2 (expr2)');
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
    ).toStrictEqual('Supplied Patient is unknown.');
  });
});
