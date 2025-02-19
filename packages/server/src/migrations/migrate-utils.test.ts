import {
  doubleEscapeSingleQuotes,
  parseIndexColumns,
  quotedColumnName,
  splitIndexColumnNames,
  tsVectorExpression,
} from './migrate-utils';

describe('migration-utils', () => {
  describe('quotedColumnName', () => {
    test('lowercase string', () => {
      expect(quotedColumnName('column')).toEqual('column');
    });

    test('mixed case string', () => {
      expect(quotedColumnName('resourceId')).toEqual('"resourceId"');
    });
  });

  test('doubleEscapeSingleQuotes', () => {
    expect(doubleEscapeSingleQuotes("to_tsvector('simple'::regconfig, value)")).toEqual(
      "to_tsvector(\\'simple\\'::regconfig, value)"
    );
  });

  test('tsVectorExpression', () => {
    expect(tsVectorExpression('simple', 'column')).toEqual("to_tsvector('simple'::regconfig, column)");
  });

  test('splitIndexColumnNames', () => {
    expect(splitIndexColumnNames('col1__col2___col3')).toEqual(['col1', '_col2', '__col3']);
  });

  test.each([
    ["system, to_tsvector('english'::regconfig, display)", ['system', "to_tsvector('english'::regconfig, display)"]],
  ])('parseIndexColumns %s', (input, expected) => {
    expect(parseIndexColumns(input)).toEqual(expected);
  });
});
