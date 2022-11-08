import { Condition, Negation, Operator, SelectQuery, SqlBuilder } from './sql';

describe('SqlBuilder', () => {
  test('Select', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').column('name').buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id", "MyTable"."name" FROM "MyTable"');
  });

  test('Select where', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', Operator.EQUALS, 'x').buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name"=$1');
  });

  test('Select where expression', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').whereExpr(new Condition('name', Operator.EQUALS, 'x')).buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "name"=$1');
  });

  test('Select where negation', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable')
      .column('id')
      .whereExpr(new Negation(new Condition('name', Operator.EQUALS, 'x')))
      .buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE NOT ("name"=$1)');
  });

  test('Select where array contains', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', Operator.ARRAY_CONTAINS, 'x').buildSql(sql);
    expect(sql.toString()).toBe(
      'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name"&&ARRAY[$1])'
    );
  });

  test('Select where array contains array', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', Operator.ARRAY_CONTAINS, ['x', 'y']).buildSql(sql);
    expect(sql.toString()).toBe(
      'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name"&&ARRAY[$1,$2])'
    );
  });

  test('Select where is null', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', Operator.EQUALS, null).buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" IS NULL');
  });

  test('Select where is not null', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', Operator.NOT_EQUALS, null).buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" IS NOT NULL');
  });
});
