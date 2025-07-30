import { Client } from 'pg';
import {
  Column,
  Condition,
  Negation,
  Operator,
  SelectQuery,
  SqlBuilder,
  UnionAllBuilder,
  ValuesQuery,
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
});
