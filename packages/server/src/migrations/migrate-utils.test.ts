// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  doubleEscapeSingleQuotes,
  escapeUnicode,
  parseIndexColumns,
  splitIndexColumnNames,
  tsVectorExpression,
} from './migrate-utils';

describe('migration-utils', () => {
  test('doubleEscapeSingleQuotes', () => {
    expect(doubleEscapeSingleQuotes("to_tsvector('simple'::regconfig, value)")).toEqual(
      "to_tsvector(\\'simple\\'::regconfig, value)"
    );
  });

  test('tsVectorExpression', () => {
    expect(tsVectorExpression('simple', 'all_lower')).toEqual("to_tsvector('simple'::regconfig, all_lower)");
    expect(tsVectorExpression('simple', 'someUpper')).toEqual('to_tsvector(\'simple\'::regconfig, "someUpper")');
  });

  test('splitIndexColumnNames', () => {
    expect(splitIndexColumnNames('col1__col2___col3')).toEqual(['col1', '_col2', '__col3']);
  });

  test.each([
    ["system, to_tsvector('english'::regconfig, display)", ['system', "to_tsvector('english'::regconfig, display)"]],
  ])('parseIndexColumns %s', (input, expected) => {
    expect(parseIndexColumns(input)).toEqual(expected);
  });

  test('escapeUnicode', () => {
    expect(escapeUnicode('lighthouse')).toEqual('lighthouse');
    expect(escapeUnicode('\t')).toEqual('\t');
    expect(escapeUnicode('apple\tbanana\tcherry')).toEqual('apple\tbanana\tcherry');
    expect(escapeUnicode('\x01')).toEqual('\\x01');
    expect(escapeUnicode('\x7F')).toEqual('\\x7f');
    expect(escapeUnicode('🦄')).toEqual('\\ud83e\\udd84');
    expect(escapeUnicode('\u{1F984}')).toEqual('\\ud83e\\udd84');
    expect(escapeUnicode('\ud83e\udd84')).toEqual('\\ud83e\\udd84');
  });
});
