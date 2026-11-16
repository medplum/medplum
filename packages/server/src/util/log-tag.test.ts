// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { Request } from 'express';
import { LOG_TAG_HEADER, getLogTag } from './log-tag';

function mockRequest(value?: string): Request {
  return { header: (name: string) => (name === LOG_TAG_HEADER ? value : undefined) } as unknown as Request;
}

describe('getLogTag', () => {
  test('Missing header', () => {
    expect(getLogTag(mockRequest())).toBeUndefined();
  });

  test('Passes through usable values', () => {
    expect(getLogTag(mockRequest('user-1234'))).toBe('user-1234');
    expect(getLogTag(mockRequest('tenant=acme; user=1234'))).toBe('tenant=acme; user=1234');
    expect(getLogTag(mockRequest('{"u":"1234"}'))).toBe('{"u":"1234"}');
    expect(getLogTag(mockRequest('a'))).toBe('a');
    expect(getLogTag(mockRequest('a'.repeat(128)))).toBe('a'.repeat(128));
  });

  test('Rejects an empty value', () => {
    expect(() => getLogTag(mockRequest(''))).toThrow(OperationOutcomeError);
  });

  test('Rejects a value over the length limit', () => {
    expect(() => getLogTag(mockRequest('a'.repeat(129)))).toThrow(OperationOutcomeError);
  });

  test('Rejects values outside printable ASCII', () => {
    expect(() => getLogTag(mockRequest('user\n1234'))).toThrow(OperationOutcomeError);
    expect(() => getLogTag(mockRequest('user\t1234'))).toThrow(OperationOutcomeError);
    expect(() => getLogTag(mockRequest('\x1b[31muser'))).toThrow(OperationOutcomeError);
    expect(() => getLogTag(mockRequest('useré'))).toThrow(OperationOutcomeError);
  });

  test('Does not echo the rejected value', () => {
    expect(() => getLogTag(mockRequest('user\n1234'))).toThrow(
      `Invalid ${LOG_TAG_HEADER} header: expected 1 to 128 characters of printable ASCII`
    );
  });
});
