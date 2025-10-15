// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { tokenize } from './tokenize';

describe('Tokenizer', () => {
  test('Single line comment', () => {
    expect(tokenize('2 + 2 // This is a single-line comment')).toMatchObject([
      { id: 'Number', value: '2' },
      { id: '+', value: '+' },
      { id: 'Number', value: '2' },
      { id: 'Comment', value: '// This is a single-line comment' },
    ]);
  });

  test('Multi line comment', () => {
    expect(
      tokenize(`
    /*
     * Comment before
     */
    2 + 2
    /*
     * Comment after
     */
    `)
    ).toMatchObject([
      { id: 'Comment' },
      { id: 'Number', value: '2' },
      { id: '+', value: '+' },
      { id: 'Number', value: '2' },
      { id: 'Comment' },
    ]);
  });

  test('Simple string matching', () => {
    const matches = tokenize('  (  + ) /   ( *  ');
    expect(matches).toMatchObject([
      { id: '(', value: '(' },
      { id: '+', value: '+' },
      { id: ')', value: ')' },
      { id: '/', value: '/' },
      { id: '(', value: '(' },
      { id: '*', value: '*' },
    ]);
  });

  test('Quantity matching', () => {
    expect(tokenize("1 'mg'")).toMatchObject([{ id: 'Quantity', value: "1 'mg'" }]);
  });

  test('Number matching', () => {
    expect(tokenize('1')).toMatchObject([{ id: 'Number', value: '1' }]);
    expect(tokenize('1 ')).toMatchObject([{ id: 'Number', value: '1' }]);
    expect(tokenize('1.0')).toMatchObject([{ id: 'Number', value: '1.0' }]);
    expect(tokenize('-1')).toMatchObject([
      { id: '-', value: '-' },
      { id: 'Number', value: '1' },
    ]);
    expect(tokenize('-1.0')).toMatchObject([
      { id: '-', value: '-' },
      { id: 'Number', value: '1.0' },
    ]);
  });

  test('DateTime matching', () => {
    expect(tokenize('@2012-04-15T15:00:00+02:00')).toMatchObject([
      { id: 'DateTime', value: '2012-04-15T15:00:00+02:00' },
    ]);
  });

  test('Regular expression matching', () => {
    const matches = tokenize('bc + dsf -  // the comment + - dasdas');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'bc' },
      { id: '+', value: '+' },
      { id: 'Symbol', value: 'dsf' },
      { id: '-', value: '-' },
      { id: 'Comment', value: '// the comment + - dasdas' },
    ]);
  });

  test('Empty string', () => {
    expect(tokenize('')).toStrictEqual([]);
  });

  describe('String escapes', () => {
    test('String escape sequence', () => {
      expect(tokenize("'\\\\\\/\\f\\r\\n\\t\\\"\\`\\'\\u002a'")).toMatchObject([
        {
          id: 'String',
          value: '\\/\f\r\n\t"`\'*',
        },
      ]);
    });

    test.each([
      // See https://build.fhir.org/ig/HL7/FHIRPath/#string
      ["'\\''", "'"], // \' Single-quote
      [`'\\"'`, '"'], // \" Double-quote
      ["'\\`'", '`'], // \` Backtick
      ["'\\r'", '\r'], // \r Carriage Return
      ["'\\n'", '\n'], // \n Line Feed
      ["'\\t'", '\t'], // \t Tab
      ["'\\f'", '\f'], // \f Form Feed
      ["'\\\\'", '\\'], // \\ Backslash
      ["'\\u002a'", '\u002a'], // \uXXXX Unicode character, where XXXX is the hexadecimal representation of the character
    ])('String escapes 2', (fhirPathString, jsString) => {
      expect(tokenize(fhirPathString)).toMatchObject([{ id: 'String', value: jsString }]);
    });

    test.each([
      // If a \ is used at the beginning of a non-escape sequence, it will be ignored and will not appear in the sequence.
      ["'\\p'", 'p'],
      ["'\\\\p'", '\\p'],
      ["'\\3'", '3'],
      ["'\\u005'", 'u005'],
      ["'\\ '", ' '],
    ])('String escapes 3', (fhirPathString, jsString) => {
      expect(tokenize(fhirPathString)).toMatchObject([{ id: 'String', value: jsString }]);
    });

    test('String escapes 4', () => {
      expect(tokenize("'\\'wrapped in single quotes\\''")).toMatchObject([
        {
          id: 'String',
          value: "'wrapped in single quotes'",
        },
      ]);
    });

    test('String escapes 5', () => {
      expect(tokenize(`'\\"wrapped in double quotes\\"'`)).toMatchObject([
        {
          id: 'String',
          value: '"wrapped in double quotes"',
        },
      ]);
    });
  });

  describe('Literal unicode', () => {
    // See spec: https://build.fhir.org/ig/HL7/FHIRPath/#string
    test('Literal unicode 1', () => {
      // In FHIR Path land: 'Peter' -> Peter
      // Reason: Trivial
      expect(tokenize("'P\u0065ter'")).toMatchObject([{ id: 'String', value: 'Peter' }]);
    });

    test('Literal unicode 2', () => {
      // In FHIR Path land: 'P\u0065ter' -> Peter
      // Reason: FHIR Path Unicode characters
      expect(tokenize("'P\\u0065ter'")).toMatchObject([{ id: 'String', value: 'Peter' }]);
    });

    test('Literal unicode 3', () => {
      // In FHIR Path land: 'P\eter' -> Peter
      // Reason: If a \ is used at the beginning of a non-escape sequence, it will be ignored and will not appear in the sequence.
      expect(tokenize("'P\\\u0065ter'")).toMatchObject([{ id: 'String', value: 'Peter' }]);
    });

    test('Literal unicode 4', () => {
      // In FHIR Path land: 'P\\u0065ter' -> P\u0065ter
      // Reason: Unescape backslash
      expect(tokenize("'P\\\\u0065ter'")).toMatchObject([{ id: 'String', value: 'P\\u0065ter' }]);
    });
  });

  test('FHIR Path', () => {
    const matches = tokenize('Patient.name.given');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' },
    ]);
  });

  test('FHIR Path union', () => {
    const matches = tokenize('Practitioner.name.given | Patient.name.given');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Practitioner' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' },
      { id: '|', value: '|' },
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'given' },
    ]);
  });

  test('FHIR Path function', () => {
    const matches = tokenize("Patient.telecom.where(system='email')");
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'telecom' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'where' },
      { id: '(', value: '(' },
      { id: 'Symbol', value: 'system' },
      { id: '=', value: '=' },
      { id: 'String', value: 'email' },
      { id: ')', value: ')' },
    ]);
  });

  test('FHIR Path index[number]', () => {
    const matches = tokenize('Patient.name[0]');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '[', value: '[' },
      { id: 'Number', value: '0' },
      { id: ']', value: ']' },
    ]);
  });

  test('FHIR Path index[string]', () => {
    const matches = tokenize('Patient.name[zebra]');
    expect(matches).toMatchObject([
      { id: 'Symbol', value: 'Patient' },
      { id: '.', value: '.' },
      { id: 'Symbol', value: 'name' },
      { id: '[', value: '[' },
      { id: 'Symbol', value: 'zebra' },
      { id: ']', value: ']' },
    ]);
  });

  test('Quantity units', () => {
    expect(tokenize("1.0 'mg'")).toMatchObject([{ id: 'Quantity', value: "1.0 'mg'" }]);
    expect(tokenize('7 days = 1 week')).toMatchObject([
      { id: 'Quantity', value: '7 days' },
      { id: '=', value: '=' },
      { id: 'Quantity', value: '1 week' },
    ]);
  });
});
