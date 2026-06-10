// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MockConsole } from './console';

describe('MockConsole', () => {
  let console: MockConsole;

  beforeEach(() => {
    console = new MockConsole();
  });

  test('log() stores message', () => {
    console.log('hello', 'world');
    expect(console.messages).toEqual(['hello world']);
  });

  test('error() stores message', () => {
    console.error('something went wrong');
    expect(console.messages).toEqual(['something went wrong']);
  });

  test('warn() stores message', () => {
    console.warn('be careful');
    expect(console.messages).toEqual(['be careful']);
  });

  test('info() stores message', () => {
    console.info('for your information');
    expect(console.messages).toEqual(['for your information']);
  });

  test('debug() stores message', () => {
    console.debug('debug value', 42);
    expect(console.messages).toEqual(['debug value 42']);
  });

  test('trace() stores message', () => {
    console.trace('trace point');
    expect(console.messages).toEqual(['trace point']);
  });

  test('all methods contribute to the same messages array', () => {
    console.log('log');
    console.error('error');
    console.warn('warn');
    console.info('info');
    console.debug('debug');
    console.trace('trace');
    expect(console.messages).toHaveLength(6);
  });

  test('toString() returns all messages joined by newline', () => {
    console.log('first');
    console.error('second');
    console.warn('third');
    expect(console.toString()).toBe('first\nsecond\nthird');
  });
});
