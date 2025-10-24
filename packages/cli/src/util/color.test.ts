// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { color, processDescription } from './color';

describe('CLI Color Utilities', () => {
  // Tests for color object
  describe('color object', () => {
    test('red function adds red color codes', () => {
      expect(color.red('test')).toBe('\x1b[31mtest\x1b[0m');
    });

    test('green function adds green color codes', () => {
      expect(color.green('test')).toBe('\x1b[32mtest\x1b[0m');
    });

    test('yellow function adds yellow color codes', () => {
      expect(color.yellow('test')).toBe('\x1b[33mtest\x1b[0m');
    });

    test('blue function adds blue color codes', () => {
      expect(color.blue('test')).toBe('\x1b[34mtest\x1b[0m');
    });

    test('bold function adds bold formatting codes', () => {
      expect(color.bold('test')).toBe('\x1b[1mtest\x1b[0m');
    });
  });

  // Tests for processDescription function
  describe('processDescription function', () => {
    test('replaces **text** with bold formatting', () => {
      const input = 'This is a **bold** text';
      const expected = `This is a ${color.bold('bold')} text`;
      expect(processDescription(input)).toBe(expected);
    });

    test('handles multiple bold sections', () => {
      const input = '**Hello** world, this is **important**';
      const expected = `${color.bold('Hello')} world, this is ${color.bold('important')}`;
      expect(processDescription(input)).toBe(expected);
    });

    test('returns original string if no bold markers are present', () => {
      const input = 'No bold text here';
      expect(processDescription(input)).toBe(input);
    });

    test('handles empty string', () => {
      expect(processDescription('')).toBe('');
    });

    test('handles string with only bold markers', () => {
      const input = '**bold**';
      const expected = color.bold('bold');
      expect(processDescription(input)).toBe(expected);
    });
  });
});
