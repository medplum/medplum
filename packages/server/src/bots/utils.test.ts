// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Bot } from '@medplum/fhirtypes';
import { getJsFileExtension } from './utils';

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
