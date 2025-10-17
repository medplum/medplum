// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Client } from 'pg';
import type { CTE, Operator } from './sql';
import {
  Column,
  Condition,
  Constant,
  Negation,
  SelectQuery,
  SqlBuilder,
  TypedCondition,
  UnionAllBuilder,
  UpdateQuery,
  ValuesQuery,
  combineExpressions,
  isValidTableName,
  periodToRangeString,
} from './sql';

describe('SqlBuilder', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  describe('SelectQuery', () => {
    test('Select', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').column('name').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id", "MyTable"."name" FROM "MyTable"');
    });

    test('Select where', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', '=', 'x').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" = $1');
    });

    test('Select where expression', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .whereExpr(new Condition('name', '=', 'x'))
        .buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "name" = $1');
    });

    test('Select where negation', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .whereExpr(new Negation(new Condition('name', '=', 'x')))
        .buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE NOT ("name" = $1)');
    });

    describe('array contains', () => {
      test('single value', () => {
        const sql = new SqlBuilder();
        new SelectQuery('MyTable').column('id').where('name', 'ARRAY_OVERLAPS', 'x', 'TEXT[]').buildSql(sql);
        expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" @> ARRAY[$1]::TEXT[]');
      });

      test('multiple values', () => {
        const sql = new SqlBuilder();
        new SelectQuery('MyTable').column('id').where('name', 'ARRAY_OVERLAPS', ['x', 'y'], 'TEXT[]').buildSql(sql);
        expect(sql.toString()).toBe(
          'SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" && ARRAY[$1,$2]::TEXT[]'
        );
      });

      test('missing param type', () => {
        const sql = new SqlBuilder();
        expect(() =>
          new SelectQuery('MyTable').column('id').where('name', 'ARRAY_OVERLAPS', 'x').buildSql(sql)
        ).toThrow('ARRAY_OVERLAPS requires paramType');
      });
    });

    describe('array contains and is not null', () => {
      test('single value', () => {
        const sql = new SqlBuilder();
        new SelectQuery('MyTable')
          .column('id')
          .where('name', 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', 'x', 'TEXT[]')
          .buildSql(sql);
        expect(sql.toString()).toBe(
          'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name" @> ARRAY[$1]::TEXT[])'
        );
      });

      test('multiple values', () => {
        const sql = new SqlBuilder();
        new SelectQuery('MyTable')
          .column('id')
          .where('name', 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', new Set(['x', 'y']), 'TEXT[]')
          .buildSql(sql);
        expect(sql.toString()).toBe(
          'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name" && ARRAY[$1,$2]::TEXT[])'
        );
      });

      test('missing param type', () => {
        const sql = new SqlBuilder();
        expect(() =>
          new SelectQuery('MyTable').column('id').where('name', 'ARRAY_OVERLAPS_AND_IS_NOT_NULL', 'x').buildSql(sql)
        ).toThrow('ARRAY_OVERLAPS_AND_IS_NOT_NULL requires paramType');
      });
    });

    test('Select where is null', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', '=', null).buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" IS NULL');
    });

    test('Select where is not null', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', '!=', null).buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" IS NOT NULL');
    });

    test('Select value in subquery with type', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .where('name', 'IN_SUBQUERY', new SelectQuery('MyLookup').column('values'), 'TEXT[]')
        .buildSql(sql);
      expect(sql.toString()).toBe(
        'SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name"=ANY((SELECT "MyLookup"."values" FROM "MyLookup")::TEXT[])'
      );
    });

    test('Select value in subquery without type', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .where('name', 'IN_SUBQUERY', new SelectQuery('MyLookup').column('values'))
        .buildSql(sql);
      expect(sql.toString()).toBe(
        'SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name"=ANY(SELECT "MyLookup"."values" FROM "MyLookup")'
      );
    });

    test('Select group by', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').groupBy('name').groupBy(new Column('MyTable', 'email')).buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" GROUP BY "MyTable"."name", "MyTable"."email"');
    });

    test('Select distinct on', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .column('name')
        .distinctOn('id')
        .distinctOn(new Column('MyTable', 'name'))
        .buildSql(sql);
      expect(sql.toString()).toBe(
        'SELECT DISTINCT ON ("MyTable"."id", "MyTable"."name") "MyTable"."id", "MyTable"."name" FROM "MyTable"'
      );
    });

    test('Select with subquery', () => {
      const sql = new SqlBuilder();

      const joinName = 'T1';
      const joinOnExpression = new Condition(new Column(joinName, 'id'), '=', new Column('MyJoinTable', 'id'));

      new SelectQuery('MyTable')
        .column('id')
        .join('INNER JOIN', new SelectQuery('MyJoinTable').column('id'), joinName, joinOnExpression)
        .buildSql(sql);

      expect(sql.toString()).toBe(
        'SELECT "MyTable"."id" FROM "MyTable" INNER JOIN (SELECT "MyJoinTable"."id" FROM "MyJoinTable") AS "T1" ON "T1"."id" = "MyJoinTable"."id"'
      );
    });

    test('Select with simple lateral join', () => {
      const sql = new SqlBuilder();

      const joinName = 'T1';
      const joinOnExpression = new Constant('true');

      new SelectQuery('MyTable')
        .column('id')
        .join('LEFT JOIN LATERAL', new SelectQuery('MyJoinTable').column('id'), joinName, joinOnExpression)
        .buildSql(sql);

      expect(sql.toString()).toBe(
        'SELECT "MyTable"."id" FROM "MyTable" LEFT JOIN LATERAL (SELECT "MyJoinTable"."id" FROM "MyJoinTable") AS "T1" ON true'
      );
    });

    test('Select with realistic lateral join', () => {
      const sql = new SqlBuilder();

      const joinName = 'T1';
      const joinOnExpression = new Constant('true');

      new SelectQuery('Patient')
        .column('id')
        .join(
          'LEFT JOIN LATERAL',
          new SelectQuery('HumanName')
            .column('resourceId')
            .column('name')
            .where(new Column('HumanName', 'resourceId'), '=', new Column('Patient', 'id'))
            .orderBy(new Column('HumanName', 'resourceId'), false)
            .limit(1),
          joinName,
          joinOnExpression
        )
        .orderBy(new Column('T1', 'name'), false)
        .buildSql(sql);

      expect(sql.toString()).toBe(
        'SELECT "Patient"."id" FROM "Patient" LEFT JOIN LATERAL (SELECT "HumanName"."resourceId", "HumanName"."name" FROM "HumanName" WHERE "HumanName"."resourceId" = "Patient"."id" ORDER BY "HumanName"."resourceId" LIMIT 1) AS "T1" ON true ORDER BY "T1"."name"'
      );
    });

    test('Select distinct on sorting', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .column('name')
        .column('email')
        .distinctOn('id')
        .distinctOn(new Column('MyTable', 'name'))
        .orderBy('email')
        .buildSql(sql);
      expect(sql.toString()).toBe(
        'SELECT DISTINCT ON ("MyTable"."id", "MyTable"."name") "MyTable"."id", "MyTable"."name", "MyTable"."email" FROM "MyTable" ORDER BY "MyTable"."id", "MyTable"."name", "MyTable"."email"'
      );
    });

    test('Select where not equals', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', '!=', 'x').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" <> $1');
    });

    test('Select where lower like', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', 'LOWER_LIKE', 'x').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE LOWER("MyTable"."name") LIKE $1');
    });

    test('Select where ilike', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').column('id').where('name', 'ILIKE', 'x').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" ILIKE $1');
    });

    test('Select missing columns', () => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable').buildSql(sql);
      expect(sql.toString()).toEqual(`SELECT 1 FROM "MyTable"`);
    });

    test('periodToRangeString', () => {
      expect(periodToRangeString({})).toBeUndefined();
      expect(periodToRangeString({ start: '2020-01-01' })).toBe('[2020-01-01,]');
      expect(periodToRangeString({ end: '2020-01-01' })).toBe('[,2020-01-01]');
      expect(periodToRangeString({ start: '2020-01-01', end: '2020-01-02' })).toBe('[2020-01-01,2020-01-02]');
    });

    test('Debug mode', async () => {
      console.log = jest.fn();

      const sql = new SqlBuilder();
      sql.debug = 'true';
      new SelectQuery('MyTable').column('id').buildSql(sql);
      expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable"');

      const conn = {
        query: jest.fn(() => ({ rows: [] })),
      } as unknown as Client;

      await sql.execute(conn);
      expect(console.log).toHaveBeenCalledWith('sql', 'SELECT "MyTable"."id" FROM "MyTable"');
    });

    test.each(['simple', 'english'])('Text search with tsquery', (type) => {
      const sql = new SqlBuilder();
      new SelectQuery('MyTable')
        .column('id')
        .where('name', ('TSVECTOR_' + type.toUpperCase()) as keyof typeof Operator, 'Jimmy (James) Dean')
        .buildSql(sql);
      expect(sql.toString()).toBe(
        `SELECT "MyTable"."id" FROM "MyTable" WHERE to_tsvector('${type}',"MyTable"."name") @@ to_tsquery('${type}',$1)`
      );
      expect(sql.getValues()).toStrictEqual(['Jimmy:* & James:* & Dean:*']);
    });
  });

  describe('ValuesQuery', () => {
    test('one row, one value', () => {
      const sql = new SqlBuilder();
      new ValuesQuery('MyValues', ['firstCol'], [['firstVal']]).buildSql(sql);
      expect(sql.toString()).toBe('SELECT * FROM (VALUES($1)) AS "MyValues"("firstCol")');
    });

    test('multiple rows, multiple values', () => {
      const sql = new SqlBuilder();
      new ValuesQuery(
        'MyValues',
        ['firstCol', 'secondCol', 'thirdCol'],
        [
          ['one', 'two', 3],
          ['four', 'five', 6],
        ]
      ).buildSql(sql);
      expect(sql.toString()).toBe(
        'SELECT * FROM (VALUES($1,$2,$3),($4,$5,$6)) AS "MyValues"("firstCol","secondCol","thirdCol")'
      );
    });
  });

  describe('UnionAllBuilder', () => {
    test('multiple queries', () => {
      const unionAllBuilder = new UnionAllBuilder();
      unionAllBuilder.add(new SelectQuery('MyTable').column('id').column('my_table_col'));
      expect(unionAllBuilder.sql.toString()).toBe('(SELECT "MyTable"."id", "MyTable"."my_table_col" FROM "MyTable")');

      unionAllBuilder.add(new SelectQuery('MyOtherTable').column('id').column('my_other_table_col'));
      expect(unionAllBuilder.sql.toString()).toBe(
        '(SELECT "MyTable"."id", "MyTable"."my_table_col" FROM "MyTable") UNION ALL (SELECT "MyOtherTable"."id", "MyOtherTable"."my_other_table_col" FROM "MyOtherTable")'
      );

      unionAllBuilder.add(new SelectQuery('MyThirdTable').column('id').column('my_third_table_col'));
      expect(unionAllBuilder.sql.toString()).toBe(
        '(SELECT "MyTable"."id", "MyTable"."my_table_col" FROM "MyTable") UNION ALL (SELECT "MyOtherTable"."id", "MyOtherTable"."my_other_table_col" FROM "MyOtherTable") UNION ALL (SELECT "MyThirdTable"."id", "MyThirdTable"."my_third_table_col" FROM "MyThirdTable")'
      );
    });
  });

  describe('UpdateQuery', () => {
    test('Simple Update', () => {
      const sql = new SqlBuilder();
      const update = new UpdateQuery('MyTable', ['id', 'name']);
      update.set('id', 123);
      update.buildSql(sql);
      expect(sql.toString()).toBe('UPDATE "MyTable" SET "id" = $1 RETURNING "MyTable"."id", "MyTable"."name"');
      expect(sql.getValues()).toStrictEqual([123]);
    });

    test('with CTE and RETURNING', () => {
      const cteQuery = new SelectQuery('MyTable').column('id').column('name').where('projectId', '=', null).limit(10);
      const cte: CTE = {
        name: 'MyCTE',
        expr: cteQuery,
      };

      const sql = new SqlBuilder();
      const update = new UpdateQuery('MyTable', ['id']);
      update.from(cte);
      update.set('id', 123);
      update.set('name', 'new-name');
      update.where(new Column('MyCTE', 'id'), '=', new Column('MyTable', 'id'));
      update.buildSql(sql);
      expect(sql.toString()).toBe(
        'WITH "MyCTE" AS (SELECT "MyTable"."id", "MyTable"."name" FROM "MyTable" WHERE "MyTable"."projectId" IS NULL LIMIT 10) UPDATE "MyTable" SET "id" = $1, "name" = $2 FROM "MyCTE" WHERE "MyCTE"."id" = "MyTable"."id" RETURNING "MyTable"."id"'
      );
      expect(sql.getValues()).toStrictEqual([123, 'new-name']);
    });
  });

  describe('combineExpressions', () => {
    test('combines multiple ARRAY_OVERLAPS conditions on same table, column, and type', () => {
      // given
      const tc1 = new TypedCondition(
        new Column('MyTable', 'tokenColumnName'),
        'ARRAY_OVERLAPS',
        '7f0b383c-1bea-4c74-bb33-ac772a94aa18',
        'UUID[]'
      );
      const tc2 = new TypedCondition(
        new Column('MyTable', 'tokenColumnName'),
        'ARRAY_OVERLAPS',
        '46f2da5a-bcce-4438-a9f3-748d0a582874',
        'UUID[]'
      );
      const tc3 = new TypedCondition(
        new Column('MyTable', 'tokenColumnName'),
        'ARRAY_OVERLAPS',
        '8dddbd03-3529-43c5-a3e3-1bc1504df021',
        'UUID[]'
      );

      // when
      const combinedExpressions = combineExpressions([tc1, tc2, tc3]);

      // then
      expect(combinedExpressions.length).toStrictEqual(1);
      const combinedTc = combinedExpressions[0] as TypedCondition<'ARRAY_OVERLAPS'>;
      expect(combinedTc.operator).toStrictEqual('ARRAY_OVERLAPS');
      expect(combinedTc.parameter).toStrictEqual([
        '7f0b383c-1bea-4c74-bb33-ac772a94aa18',
        '46f2da5a-bcce-4438-a9f3-748d0a582874',
        '8dddbd03-3529-43c5-a3e3-1bc1504df021',
      ]);
      expect(combinedTc.parameterType).toStrictEqual('UUID[]');
      expect(combinedTc.column.tableName).toStrictEqual('MyTable');
      expect(combinedTc.column.actualColumnName).toStrictEqual('tokenColumnName');
    });

    test('does not combine conditions with different columns', () => {
      // given
      const tc1 = new TypedCondition(new Column('MyTable', 'column1'), 'ARRAY_OVERLAPS', 'value1', 'UUID[]');
      const tc2 = new TypedCondition(new Column('MyTable', 'column2'), 'ARRAY_OVERLAPS', 'value2', 'UUID[]');

      // when
      const combinedExpressions = combineExpressions([tc1, tc2]);

      // then
      expect(combinedExpressions.length).toStrictEqual(2);
      expect(combinedExpressions).toContain(tc1);
      expect(combinedExpressions).toContain(tc2);
    });

    test('does not combine conditions with different tables', () => {
      // given
      const tc1 = new TypedCondition(new Column('Table1', 'column'), 'ARRAY_OVERLAPS', 'value1', 'UUID[]');
      const tc2 = new TypedCondition(new Column('Table2', 'column'), 'ARRAY_OVERLAPS', 'value2', 'UUID[]');

      // when
      const combinedExpressions = combineExpressions([tc1, tc2]);

      // then
      expect(combinedExpressions.length).toStrictEqual(2);
      expect(combinedExpressions).toContain(tc1);
      expect(combinedExpressions).toContain(tc2);
    });

    test('does not combine conditions with different parameter types', () => {
      // given
      const tc1 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', 'value1', 'UUID[]');
      const tc2 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', 'value2', 'TEXT[]');

      // when
      const combinedExpressions = combineExpressions([tc1, tc2]);

      // then
      expect(combinedExpressions.length).toStrictEqual(2);
      expect(combinedExpressions).toContain(tc1);
      expect(combinedExpressions).toContain(tc2);
    });

    test('does not combine non-ARRAY_OVERLAPS conditions', () => {
      // given
      const tc1 = new TypedCondition(new Column('MyTable', 'column'), '=', 'value1');
      const tc2 = new TypedCondition(new Column('MyTable', 'column'), '=', 'value2');

      // when
      const combinedExpressions = combineExpressions([tc1, tc2]);

      // then
      expect(combinedExpressions.length).toStrictEqual(2);
      expect(combinedExpressions).toContain(tc1);
      expect(combinedExpressions).toContain(tc2);
    });

    test('handles mix of combinable and non-combinable expressions', () => {
      // given
      const tc1 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', 'value1', 'UUID[]');
      const tc2 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', 'value2', 'UUID[]');
      const tc3 = new TypedCondition(new Column('MyTable', 'other'), '=', 'value3');
      const negation = new Negation(new Condition('field', '=', 'test'));

      // when
      const combinedExpressions = combineExpressions([tc1, tc2, tc3, negation]);

      // then
      expect(combinedExpressions.length).toStrictEqual(3);

      // Find the combined ARRAY_OVERLAPS condition
      const arrayOverlaps = combinedExpressions.find(
        (e) => e instanceof Condition && e.operator === 'ARRAY_OVERLAPS'
      ) as TypedCondition<'ARRAY_OVERLAPS'>;
      expect(arrayOverlaps).toBeDefined();
      expect(arrayOverlaps.parameter).toStrictEqual(['value1', 'value2']);

      // Check other expressions are preserved
      expect(combinedExpressions).toContain(tc3);
      expect(combinedExpressions).toContain(negation);
    });

    test('combines conditions with array parameters', () => {
      // given
      const tc1 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', ['value1', 'value2'], 'UUID[]');
      const tc2 = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', ['value3', 'value4'], 'UUID[]');

      // when
      const combinedExpressions = combineExpressions([tc1, tc2]);

      // then
      expect(combinedExpressions.length).toStrictEqual(1);
      const combinedTc = combinedExpressions[0] as TypedCondition<'ARRAY_OVERLAPS'>;
      expect(combinedTc.parameter).toStrictEqual(['value1', 'value2', 'value3', 'value4']);
    });

    test('returns single condition unchanged', () => {
      // given
      const tc = new TypedCondition(new Column('MyTable', 'column'), 'ARRAY_OVERLAPS', 'value1', 'UUID[]');

      // when
      const combinedExpressions = combineExpressions([tc]);

      // then
      expect(combinedExpressions.length).toStrictEqual(1);
      expect(combinedExpressions[0]).toBe(tc);
    });

    test('returns empty array for empty input', () => {
      // when
      const combinedExpressions = combineExpressions([]);

      // then
      expect(combinedExpressions.length).toStrictEqual(0);
    });

    test('combines conditions in mixed order', () => {
      // given - Conditions are NOT in table/column order, but should still be grouped correctly
      const tc1 = new TypedCondition(new Column('TableA', 'column1'), 'ARRAY_OVERLAPS', 'valueA1', 'UUID[]');
      const tc2 = new TypedCondition(new Column('TableB', 'column2'), 'ARRAY_OVERLAPS', 'valueB1', 'TEXT[]');
      const tc3 = new TypedCondition(new Column('TableA', 'column1'), 'ARRAY_OVERLAPS', 'valueA2', 'UUID[]');
      const tc4 = new TypedCondition(new Column('TableB', 'column2'), 'ARRAY_OVERLAPS', 'valueB2', 'TEXT[]');
      const tc5 = new TypedCondition(new Column('TableA', 'column1'), 'ARRAY_OVERLAPS', 'valueA3', 'UUID[]');
      const otherCondition = new TypedCondition(new Column('TableC', 'column3'), '=', 'valueC');

      // when - Pass conditions in mixed order
      const combinedExpressions = combineExpressions([tc1, tc2, tc3, tc4, tc5, otherCondition]);

      // then - Should produce 3 expressions: 2 combined ARRAY_OVERLAPS + 1 other condition
      expect(combinedExpressions.length).toStrictEqual(3);

      // Find the combined conditions
      const tableACondition = combinedExpressions.find(
        (e) => e instanceof Condition && e.operator === 'ARRAY_OVERLAPS' && e.column.tableName === 'TableA'
      ) as TypedCondition<'ARRAY_OVERLAPS'>;

      const tableBCondition = combinedExpressions.find(
        (e) => e instanceof Condition && e.operator === 'ARRAY_OVERLAPS' && e.column.tableName === 'TableB'
      ) as TypedCondition<'ARRAY_OVERLAPS'>;

      // Verify TableA conditions were combined correctly
      expect(tableACondition).toBeDefined();
      expect(tableACondition.column.actualColumnName).toBe('column1');
      expect(tableACondition.parameter).toStrictEqual(['valueA1', 'valueA2', 'valueA3']);
      expect(tableACondition.parameterType).toBe('UUID[]');

      // Verify TableB conditions were combined correctly
      expect(tableBCondition).toBeDefined();
      expect(tableBCondition.column.actualColumnName).toBe('column2');
      expect(tableBCondition.parameter).toStrictEqual(['valueB1', 'valueB2']);
      expect(tableBCondition.parameterType).toBe('TEXT[]');

      // Verify other condition is preserved
      expect(combinedExpressions).toContain(otherCondition);
    });
  });
});

test('isValidTableName', () => {
  expect(isValidTableName('Observation')).toStrictEqual(true);
  expect(isValidTableName('Observation_History')).toStrictEqual(true);
  expect(isValidTableName('Observation_Token_text_idx_tsv')).toStrictEqual(true);
  expect(isValidTableName('Robert"; DROP TABLE Students;')).toStrictEqual(false);
  expect(isValidTableName('Observation History')).toStrictEqual(false);
});
