// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  const payload = JSON.stringify({
    errorType: 'Error',
    errorMessage: 'provider required',
    trace: ['Error: provider required'],
  });

  test('unwraps errorMessage from a bot runtime error payload', () => {
    expect(getErrorMessage(new Error(payload))).toBe('provider required');
    expect(getErrorMessage(new OperationOutcomeError(badRequest(payload)))).toBe('provider required');
    expect(getErrorMessage(payload)).toBe('provider required');
  });

  test('returns the normalized message when it is not JSON', () => {
    expect(getErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(getErrorMessage(badRequest('Invalid input'))).toBe('Invalid input');
    expect(getErrorMessage(undefined)).toBe('Unknown error');
  });

  test.each(['{"foo":"bar"}', '{"errorMessage":123}', '123', 'null'])(
    'returns %s unchanged when it has no string errorMessage',
    (message) => {
      expect(getErrorMessage(new Error(message))).toBe(message);
    }
  );
});
