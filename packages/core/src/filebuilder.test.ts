// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { FileBuilder } from './filebuilder';

describe('FileBuilder', () => {
  test('header', () => {
    const fb = new FileBuilder('', true);
    expect(fb.toString().includes('generated')).toBeTruthy();
  });
  test('newLine', () => {
    const fb = new FileBuilder('', false);
    expect(fb.toString()).toEqual('');
    fb.newLine();
    expect(fb.toString()).toEqual('\n');
  });
  test('appendNoWrap', () => {
    const fb = new FileBuilder('', false);
    const longLine = 'word '.repeat(50);
    fb.appendNoWrap(longLine);
    expect(fb.toString()).toEqual(longLine + '\n');
  });
  test('append', () => {
    const fb = new FileBuilder('', false);
    const longLine = 'word '.repeat(50);
    fb.append(longLine);
    expect(fb.toString().split('\n').length).toBeGreaterThan(2);
    expect(fb.toString().replace(/\n/g, ' ')).toEqual(longLine);
  });
});
