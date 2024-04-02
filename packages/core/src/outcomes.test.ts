import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
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
  isGone,
  isNotFound,
  isOk,
  isOperationOutcome,
  normalizeErrorString,
  notFound,
  notModified,
  operationOutcomeToString,
  preconditionFailed,
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
    expect(conflict('bad').issue?.[0]?.details?.text).toBe('bad');
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
    expect(getStatus(conflict('bad'))).toBe(409);
    expect(getStatus(gone)).toBe(410);
    expect(getStatus(preconditionFailed)).toBe(412);
    expect(getStatus(tooManyRequests)).toBe(429);
    expect(getStatus(badRequest('bad'))).toBe(400);
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

  test('isOperationOutcome', () => {
    expect(isOperationOutcome(undefined)).toBe(false);
    expect(isOperationOutcome(null)).toBe(false);
    expect(isOperationOutcome('foo')).toBe(false);
    expect(isOperationOutcome({ resourceType: 'Patient' })).toBe(false);
    expect(isOperationOutcome({ resourceType: 'OperationOutcome' })).toBe(true);
  });

  test('operationOutcomeToString', () => {
    expect(operationOutcomeToString({ resourceType: 'OperationOutcome' } as OperationOutcome)).toEqual('Unknown error');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'foo' } } as OperationOutcomeIssue],
      })
    ).toEqual('foo');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [{ details: { text: 'foo' }, expression: ['bar'] } as OperationOutcomeIssue],
      })
    ).toEqual('foo (bar)');
    expect(
      operationOutcomeToString({
        resourceType: 'OperationOutcome',
        issue: [
          { details: { text: 'error1' }, expression: ['expr1'] } as OperationOutcomeIssue,
          { details: { text: 'error2' }, expression: ['expr2'] } as OperationOutcomeIssue,
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
