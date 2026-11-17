// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, OperationOutcomeError } from '@medplum/core';
import { describe, expect, test } from 'vitest';
import { getBotErrorMessage } from './errors';

describe('getBotErrorMessage', () => {
  const payload = JSON.stringify({
    errorType: 'Error',
    errorMessage: 'provider required',
    trace: ['Error: provider required'],
  });

  test('unwraps errorMessage from a bot runtime error payload', () => {
    expect(getBotErrorMessage(new Error(payload))).toBe('provider required');
    expect(getBotErrorMessage(new OperationOutcomeError(badRequest(payload)))).toBe('provider required');
    expect(getBotErrorMessage(payload)).toBe('provider required');
  });

  test('returns the normalized message when it is not JSON', () => {
    expect(getBotErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(getBotErrorMessage(badRequest('Invalid input'))).toBe('Invalid input');
    expect(getBotErrorMessage(undefined)).toBe('Unknown error');
  });

  test.each(['{"foo":"bar"}', '{"errorMessage":123}', '123', 'null'])(
    'returns %s unchanged when it has no string errorMessage',
    (message) => {
      expect(getBotErrorMessage(new Error(message))).toBe(message);
    }
  );
});
