// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { Operator, getSearchParameter } from '@medplum/core';
import type { ResearchStudy } from '@medplum/fhirtypes';
import type { TokenColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import { Column, Condition, Disjunction, Negation, SqlBuilder, TypedCondition } from './sql';
import { loadStructureDefinitions } from './structure';
import { buildTokenColumns, buildTokenColumnsSearchFilter, hashTokenColumnValue } from './token-column';

const DELIM = '\x01';

describe('buildTokenColumns', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('shared columns', () => {
    const focus = getSearchParameter('ResearchStudy', 'focus');
    if (!focus) {
      throw new Error('Missing search parameter');
    }
    const focusImpl = getSearchParameterImplementation(
      'ResearchStudy',
      focus
    ) as TokenColumnSearchParameterImplementation;
    expect(focusImpl.searchStrategy).toStrictEqual('token-column');
    expect(focusImpl.hasDedicatedColumns).toStrictEqual(false);

    const location = getSearchParameter('ResearchStudy', 'location');
    if (!location) {
      throw new Error('Missing search parameter');
    }
    const locationImpl = getSearchParameterImplementation(
      'ResearchStudy',
      location
    ) as TokenColumnSearchParameterImplementation;
    expect(locationImpl.searchStrategy).toStrictEqual('token-column');
    expect(locationImpl.hasDedicatedColumns).toStrictEqual(false);

    const system = 'http://example.com';
    const rs: ResearchStudy = {
      resourceType: 'ResearchStudy',
      status: 'active',
      focus: [
        {
          coding: [
            {
              system,
              code: '123',
              display: 'ONE TWO THREE',
            },
          ],
        },
      ],
      location: [
        {
          coding: [
            {
              system,
              code: '123',
              display: 'ONE TWO THREE',
            },
          ],
        },
        {
          coding: [
            {
              system,
              code: '456',
              display: 'FOUR FIVE SIX',
            },
          ],
        },
      ],
    };

    const columns: Record<string, any> = {};

    buildTokenColumns(focus, focusImpl, columns, rs);
    expect(columns).toStrictEqual({
      __focusSort: '123',
      __sharedTokens: [
        'focus',
        'focus' + DELIM + DELIM + 'ONE TWO THREE', // since Medplum incorrectly supports exact search for :text entries
        'focus' + DELIM + system,
        'focus' + DELIM + system + DELIM + '123',
        'focus' + DELIM + DELIM + '123',
      ].map(hashTokenColumnValue),
      __sharedTokensText: ['focus' + DELIM + 'ONE TWO THREE'],
    });

    buildTokenColumns(location, locationImpl, columns, rs);
    expect(columns).toStrictEqual({
      __focusSort: '123',
      __locationSort: '123',
      __sharedTokens: [
        'focus',
        'focus' + DELIM + DELIM + 'ONE TWO THREE',
        'focus' + DELIM + system,
        'focus' + DELIM + system + DELIM + '123',
        'focus' + DELIM + DELIM + '123',
        'location',
        'location' + DELIM + DELIM + 'ONE TWO THREE',
        'location' + DELIM + system, // system is used twice in location, but should only appear once
        'location' + DELIM + system + DELIM + '123',
        'location' + DELIM + DELIM + '123',
        'location' + DELIM + DELIM + 'FOUR FIVE SIX',
        'location' + DELIM + system + DELIM + '456',
        'location' + DELIM + DELIM + '456',
      ].map(hashTokenColumnValue),
      __sharedTokensText: [
        'focus' + DELIM + 'ONE TWO THREE',
        'location' + DELIM + 'ONE TWO THREE',
        'location' + DELIM + 'FOUR FIVE SIX',
      ],
    });
  });
});

describe('buildTokenColumnsSearchFilter', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  describe('EQUALS operator', () => {
    test('search with system and code', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: 'http://example.com|12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Condition);
      const cond = expr as Condition;
      expect(cond.column).toBeInstanceOf(Column);
      expect((cond.column as Column).actualColumnName).toBe('__identifier');
      expect(cond.operator).toBe('ARRAY_OVERLAPS');
      expect(cond.parameterType).toBe('UUID[]');

      // Verify the parameter is an array with the hashed value
      const expectedHash = hashTokenColumnValue('http://example.com' + DELIM + '12345');
      expect(cond.parameter).toEqual([expectedHash]);
    });

    test('search with code only (no system)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Condition);
      const cond = expr as Condition;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');

      // Searching for just the value - parameter is now an array
      const expectedHash = hashTokenColumnValue(DELIM + '12345');
      expect(cond.parameter).toEqual([expectedHash]);
    });

    test('search with system only (trailing pipe)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: 'http://example.com|',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Condition);
      const cond = expr as Condition;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');

      // Searching for just the system - parameter is now an array
      const expectedHash = hashTokenColumnValue('http://example.com');
      expect(cond.parameter).toEqual([expectedHash]);
    });

    test('search with empty system (leading pipe)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: '|12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Condition);
      const cond = expr as Condition;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');

      // Searching for NULL_SYSTEM with value - parameter is now an array
      const NULL_SYSTEM = '\x02';
      const expectedHash = hashTokenColumnValue(NULL_SYSTEM + DELIM + '12345');
      expect(cond.parameter).toEqual([expectedHash]);
    });

    test('search with comma-separated values (OR)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: '12345,67890',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Condition);
      const cond = expr as Condition;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');

      // Both hashes are now in a single parameter array (more efficient SQL)
      const expectedHash1 = hashTokenColumnValue(DELIM + '12345');
      const expectedHash2 = hashTokenColumnValue(DELIM + '67890');
      expect(cond.parameter).toEqual([expectedHash1, expectedHash2]);
    });

    test('search is case-sensitive for identifiers', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: 'ABC123',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const cond = expr as Condition;

      // Should NOT be lowercased (identifiers are case-sensitive) - parameter is now an array
      const expectedHash = hashTokenColumnValue(DELIM + 'ABC123');
      expect(cond.parameter).toEqual([expectedHash]);
    });

    test('non-dedicated columns include code prefix', () => {
      const param = getSearchParameter('ResearchStudy', 'focus');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'focus',
        operator: Operator.EQUALS,
        value: 'http://example.com|test',
      };

      const expr = buildTokenColumnsSearchFilter('ResearchStudy', 'ResearchStudy', param, filter);

      const cond = expr as Condition;

      expect((cond.column as Column).actualColumnName).toBe('__sharedTokens');

      // Should include the code prefix for non-dedicated columns - parameter is now an array
      const expectedHash = hashTokenColumnValue('focus' + DELIM + 'http://example.com' + DELIM + 'test');
      expect(cond.parameter).toEqual([expectedHash]);
    });
  });

  describe('NOT and NOT_EQUALS operators', () => {
    test('NOT operator with single value', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.NOT,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Negation);
      const negation = expr as Negation;
      expect(negation.expression).toBeInstanceOf(Condition);
    });

    test('NOT_EQUALS operator with single value', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.NOT_EQUALS,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Negation);
      const negation = expr as Negation;
      expect(negation.expression).toBeInstanceOf(Condition);
    });

    test('NOT operator with comma-separated values', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.NOT,
        value: '12345,67890',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Negation);
      const negation = expr as Negation;
      expect(negation.expression).toBeInstanceOf(Condition);

      // The inner disjunction now has 1 expression with both values in the parameter array
      const cond = negation.expression as Condition;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');
      const expectedHash1 = hashTokenColumnValue(DELIM + '12345');
      const expectedHash2 = hashTokenColumnValue(DELIM + '67890');
      expect(cond.parameter).toEqual([expectedHash1, expectedHash2]);
    });
  });

  describe('TEXT and CONTAINS operators', () => {
    test('TEXT operator searches text column', () => {
      const param = getSearchParameter('Patient', 'telecom');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'telecom',
        operator: Operator.TEXT,
        value: '555',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Disjunction);
      const disjunction = expr as Disjunction;
      expect(disjunction.expressions).toHaveLength(1);

      const cond = disjunction.expressions[0] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;
      expect(cond.operator).toBe('TOKEN_ARRAY_IREGEX');
      expect((cond.column as Column).actualColumnName).toBe('__telecomText');
      expect(cond.parameterType).toBe('TEXT[]');

      // Should search for the value as a regex substring
      const ARRAY_DELIM = '\x03';
      expect(cond.parameter).toContain('555');
      expect(cond.parameter).toContain(ARRAY_DELIM);
    });

    test('CONTAINS operator searches text column', () => {
      const param = getSearchParameter('Patient', 'telecom');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'telecom',
        operator: Operator.CONTAINS,
        value: '555',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Disjunction);
      const disjunction = expr as Disjunction;
      const cond = disjunction.expressions[0] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;
      expect(cond.operator).toBe('TOKEN_ARRAY_IREGEX');
    });

    test('TEXT operator with regex special characters escaped', () => {
      const param = getSearchParameter('Patient', 'telecom');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'telecom',
        operator: Operator.TEXT,
        value: 'test.value*',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const disjunction = expr as Disjunction;
      const cond = disjunction.expressions[0] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;

      // Special regex characters should be escaped
      expect(cond.parameter).toContain('test\\.value\\*');
    });

    test('TEXT operator with non-dedicated columns includes code prefix', () => {
      const param = getSearchParameter('ResearchStudy', 'focus');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'focus',
        operator: Operator.TEXT,
        value: 'test',
      };

      const expr = buildTokenColumnsSearchFilter('ResearchStudy', 'ResearchStudy', param, filter);

      const disjunction = expr as Disjunction;
      const cond = disjunction.expressions[0] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;

      expect((cond.column as Column).actualColumnName).toBe('__sharedTokensText');

      // Should include the code prefix in the regex pattern
      const ARRAY_DELIM = '\x03';
      expect(cond.parameter).toContain(ARRAY_DELIM + 'focus' + DELIM);
    });

    test('TEXT operator with comma-separated values (OR)', () => {
      const param = getSearchParameter('Patient', 'telecom');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'telecom',
        operator: Operator.TEXT,
        value: '555,777',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(Disjunction);
      const disjunction = expr as Disjunction;
      expect(disjunction.expressions).toHaveLength(2);

      const cond1 = disjunction.expressions[0] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;
      const cond2 = disjunction.expressions[1] as TypedCondition<'TOKEN_ARRAY_IREGEX'>;

      expect(cond1.operator).toBe('TOKEN_ARRAY_IREGEX');
      expect(cond2.operator).toBe('TOKEN_ARRAY_IREGEX');

      expect(cond1.parameter).toContain('555');
      expect(cond2.parameter).toContain('777');
    });
  });

  describe('MISSING and PRESENT operators', () => {
    test('MISSING operator with true value (dedicated columns)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.MISSING,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(TypedCondition);
      const cond = expr as TypedCondition<'ARRAY_EMPTY'>;
      expect(cond.operator).toBe('ARRAY_EMPTY');
      expect((cond.column as Column).actualColumnName).toBe('__identifier');
      expect(cond.parameterType).toBe('UUID[]');
    });

    test('MISSING operator with false value (dedicated columns)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.MISSING,
        value: 'false',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(TypedCondition);
      const cond = expr as TypedCondition<'ARRAY_NOT_EMPTY'>;
      expect(cond.operator).toBe('ARRAY_NOT_EMPTY');
      expect((cond.column as Column).actualColumnName).toBe('__identifier');
    });

    test('PRESENT operator with true value (dedicated columns)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.PRESENT,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(TypedCondition);
      const cond = expr as TypedCondition<'ARRAY_NOT_EMPTY'>;
      expect(cond.operator).toBe('ARRAY_NOT_EMPTY');
    });

    test('PRESENT operator with false value (dedicated columns)', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.PRESENT,
        value: 'false',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      expect(expr).toBeInstanceOf(TypedCondition);
      const cond = expr as TypedCondition<'ARRAY_EMPTY'>;
      expect(cond.operator).toBe('ARRAY_EMPTY');
    });

    test('MISSING operator with non-dedicated columns', () => {
      const param = getSearchParameter('ResearchStudy', 'focus');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'focus',
        operator: Operator.MISSING,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('ResearchStudy', 'ResearchStudy', param, filter);

      expect(expr).toBeInstanceOf(Negation);
      const negation = expr as Negation;
      expect(negation.expression).toBeInstanceOf(TypedCondition);

      const cond = negation.expression as TypedCondition<'ARRAY_OVERLAPS'>;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');
      expect((cond.column as Column).actualColumnName).toBe('__sharedTokens');

      // Should search for the code as a hashed value
      const expectedHash = hashTokenColumnValue('focus');
      expect(cond.parameter).toBe(expectedHash);
    });

    test('PRESENT operator with non-dedicated columns', () => {
      const param = getSearchParameter('ResearchStudy', 'focus');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'focus',
        operator: Operator.PRESENT,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('ResearchStudy', 'ResearchStudy', param, filter);

      expect(expr).toBeInstanceOf(TypedCondition);
      const cond = expr as TypedCondition<'ARRAY_OVERLAPS'>;
      expect(cond.operator).toBe('ARRAY_OVERLAPS');
      expect((cond.column as Column).actualColumnName).toBe('__sharedTokens');

      const expectedHash = hashTokenColumnValue('focus');
      expect(cond.parameter).toBe(expectedHash);
    });
  });

  describe('EXACT operator', () => {
    test('EXACT operator behaves like EQUALS', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EXACT,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter) as Condition;

      expect(expr).toBeInstanceOf(Condition);
      expect(expr.operator).toBe('ARRAY_OVERLAPS');
    });
  });

  describe('unsupported operators', () => {
    test('IN operator throws error', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.IN,
        value: 'test',
      };

      expect(() => buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter)).toThrow();
    });

    test('STARTS_WITH operator throws error', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.STARTS_WITH,
        value: 'test',
      };

      expect(() => buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter)).toThrow();
    });

    test('GREATER_THAN operator throws error', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.GREATER_THAN,
        value: 'test',
      };

      expect(() => buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter)).toThrow();
    });
  });

  describe('SQL generation', () => {
    test('generates valid SQL for simple equals search', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const builder = new SqlBuilder();
      expr.buildSql(builder);

      const sql = builder.toString();
      expect(sql).toContain('"Patient"."__identifier"');
      expect(sql).toContain('@>');
      expect(sql).toContain('ARRAY[');
    });

    test('generates valid SQL for NOT search', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.NOT,
        value: '12345',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const builder = new SqlBuilder();
      expr.buildSql(builder);

      const sql = builder.toString();
      expect(sql).toContain('NOT (');
      expect(sql).toContain('"Patient"."__identifier"');
    });

    test('generates valid SQL for TEXT search', () => {
      const param = getSearchParameter('Patient', 'telecom');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'telecom',
        operator: Operator.TEXT,
        value: '555',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const builder = new SqlBuilder();
      expr.buildSql(builder);

      const sql = builder.toString();
      expect(sql).toContain('"Patient"."__telecomText"');
      expect(sql).toContain('~*');
    });

    test('generates valid SQL for MISSING search with dedicated columns', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.MISSING,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const builder = new SqlBuilder();
      expr.buildSql(builder);

      const sql = builder.toString();
      expect(sql).toContain('"Patient"."__identifier"');
      expect(sql).toContain('ARRAY[]');
    });

    test('generates valid SQL for PRESENT search with dedicated columns', () => {
      const param = getSearchParameter('Patient', 'identifier');
      if (!param) {
        throw new Error('Missing search parameter');
      }

      const filter: Filter = {
        code: 'identifier',
        operator: Operator.PRESENT,
        value: 'true',
      };

      const expr = buildTokenColumnsSearchFilter('Patient', 'Patient', param, filter);

      const builder = new SqlBuilder();
      expr.buildSql(builder);

      const sql = builder.toString();
      expect(sql).toContain('"Patient"."__identifier"');
      expect(sql).toContain('array_length');
      expect(sql).toContain('> 0');
    });
  });
});
