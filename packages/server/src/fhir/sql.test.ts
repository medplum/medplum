// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Client, PoolClient } from 'pg';
import type { CTE, Operator } from './sql';
import {
  Column,
  Condition,
  Constant,
  CopyFromQuery,
  InsertQuery,
  Negation,
  SelectQuery,
  SqlBuilder,
  UnionAllBuilder,
  UpdateQuery,
  ValuesQuery,
  isValidTableName,
  periodToRangeString,
  resetSqlDebug,
  setSqlDebug,
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

    test('Empty insert is no-op', async () => {
      const db = { query: jest.fn() } as unknown as PoolClient;
      await expect(new InsertQuery('Patient', []).execute(db)).resolves.toStrictEqual([]);
      expect(db.query).not.toHaveBeenCalled();
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
});

test('isValidTableName', () => {
  expect(isValidTableName('Observation')).toStrictEqual(true);
  expect(isValidTableName('Observation_History')).toStrictEqual(true);
  expect(isValidTableName('Observation_Token_text_idx_tsv')).toStrictEqual(true);
  expect(isValidTableName('Robert"; DROP TABLE Students;')).toStrictEqual(false);
  expect(isValidTableName('Observation History')).toStrictEqual(false);
});

test('debug', async () => {
  const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

  const conn = {
    query: jest.fn(() => ({ rows: [] })),
  } as unknown as Client;

  const query = new SelectQuery('MyTable').column('id');

  async function executeQuery(): Promise<void> {
    const sql = new SqlBuilder();
    query.buildSql(sql);
    await sql.execute(conn);
  }

  setSqlDebug('literally anything');

  consoleLogSpy.mockClear();
  await executeQuery();
  expect(consoleLogSpy).toHaveBeenCalledWith('sql', 'SELECT "MyTable"."id" FROM "MyTable"');

  setSqlDebug(undefined);

  consoleLogSpy.mockClear();
  await executeQuery();
  expect(consoleLogSpy).not.toHaveBeenCalled();

  resetSqlDebug();
});

describe('CopyFromQuery', () => {
  test('buildCopyQuery', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'name', 'age']);
    const mockStream = {
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    expect(client.query).toHaveBeenCalled();
    const callArg = (client.query as jest.Mock).mock.calls[0][0];
    expect(callArg).toHaveProperty('text', `COPY "MyTable" ("id", "name", "age") FROM STDIN WITH (FORMAT text, DELIMITER E'\\t', NULL '\\N')`);
    expect(stream).toBeDefined();
    expect(stream.stream).toBe(mockStream);
  });

  test('writeRow with simple values', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'name', 'age']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({ id: '123', name: 'Alice', age: 30 });

    expect(mockWrite).toHaveBeenCalledWith('123\tAlice\t30\n');
  });

  test('writeRow with null values', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'name', 'age']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({ id: '123', name: null, age: undefined });

    expect(mockWrite).toHaveBeenCalledWith('123\t\\N\t\\N\n');
  });

  test('writeRow with special characters', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'content']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({ id: '123', content: 'Line1\nLine2\tTab\rReturn\\Backslash' });

    expect(mockWrite).toHaveBeenCalledWith('123\tLine1\\nLine2\\tTab\\rReturn\\\\Backslash\n');
  });

  test('writeRow with arrays and objects', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'tags', 'metadata']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({ id: '123', tags: ['tag1', 'tag2'], metadata: { key: 'value' } });

    expect(mockWrite).toHaveBeenCalledWith('123\t{tag1,tag2}\t{"key":"value"}\n');
  });

  test('completeCopy resolves on finish', async () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'name']);
    const mockOn = jest.fn((event, callback) => {
      if (event === 'finish') {
        setTimeout(callback, 0);
      }
    });
    const mockEnd = jest.fn();
    const mockStream = {
      write: jest.fn(),
      end: mockEnd,
      on: mockOn,
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    const promise = copyFrom.completeCopy(client, stream);

    expect(mockEnd).toHaveBeenCalled();
    await expect(promise).resolves.toBeUndefined();
  });

  test('completeCopy rejects on error', async () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'name']);
    const testError = new Error('Copy failed');
    const mockOn = jest.fn((event, callback) => {
      if (event === 'error') {
        setTimeout(() => callback(testError), 0);
      }
    });
    const mockEnd = jest.fn();
    const mockStream = {
      write: jest.fn(),
      end: mockEnd,
      on: mockOn,
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    const promise = copyFrom.completeCopy(client, stream);

    await expect(promise).rejects.toThrow('Copy failed');
  });

  test('writeRow with UUID arrays', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'compartments']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({
      id: '123',
      compartments: ['6f7da1e6-d5d2-43a6-aedc-5384dd2da6fd', '96f2b92a-1827-4be3-abe7-a931a4c9c49d'],
    });

    expect(mockWrite).toHaveBeenCalledWith(
      '123\t{6f7da1e6-d5d2-43a6-aedc-5384dd2da6fd,96f2b92a-1827-4be3-abe7-a931a4c9c49d}\n'
    );
  });

  test('writeRow with array elements containing special characters', () => {
    const copyFrom = new CopyFromQuery('MyTable', ['id', 'values']);
    const mockWrite = jest.fn();
    const mockStream = {
      write: mockWrite,
      end: jest.fn(),
      on: jest.fn(),
    };
    const client = {
      query: jest.fn(() => mockStream),
    } as unknown as PoolClient;

    const stream = copyFrom.getCopyStream(client);
    stream.writeRow({
      id: '123',
      values: ['value with space', 'value,with,comma', 'value"with"quote', 'value\\with\\backslash', ''],
    });

    expect(mockWrite).toHaveBeenCalledWith(
      '123\t{"value with space","value,with,comma","value\\"with\\"quote","value\\\\with\\\\backslash",""}\n'
    );
  });
});
