// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { allOk, badRequest } from '@medplum/core';
import type { Bot } from '@medplum/fhirtypes';
import { getJsFileExtension, normalizeBotExecutionResult } from './utils';

describe('getJsFileExtension', () => {
  test('returns .cjs for CommonJS code with .cjs extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.cjs' } } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .mjs for ESM code with .mjs extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.mjs' } } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .mjs for ESM code without extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.js' } } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .cjs for CommonJS code without extension', () => {
    const bot = { id: '1', executableCode: { title: 'bot.js' } } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .mjs for ESM code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'export const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.mjs');
  });

  test('returns .cjs for CommonJS code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'module.exports = {};';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });

  test('returns .cjs for ambiguous code without filename', () => {
    const bot = { id: '1' } as Bot;
    const code = 'const foo = 42;';
    expect(getJsFileExtension(bot, code)).toBe('.cjs');
  });
});

describe('normalizeBotExecutionResult', () => {
  test('keeps success true for OK OperationOutcome return values', () => {
    expect(normalizeBotExecutionResult({ success: true, logResult: '', returnValue: allOk })).toMatchObject({
      success: true,
      returnValue: allOk,
    });
  });

  test('sets success false for non-OK OperationOutcome return values', () => {
    const outcome = badRequest('test');

    expect(normalizeBotExecutionResult({ success: true, logResult: '', returnValue: outcome })).toMatchObject({
      success: false,
      returnValue: outcome,
    });
  });

  test('does not reinterpret legacy runtime error objects', () => {
    const returnValue = { errorType: 'OperationOutcomeError', errorMessage: 'test' };

    expect(normalizeBotExecutionResult({ success: false, logResult: '', returnValue })).toMatchObject({
      success: false,
      returnValue,
    });
  });
});
