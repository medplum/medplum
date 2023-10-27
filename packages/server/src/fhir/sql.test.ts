import { Column, Condition, Negation, SelectQuery, SqlBuilder } from './sql';

describe('SqlBuilder', () => {
  test('Select', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').column('name').buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id", "MyTable"."name" FROM "MyTable"');
  });

  test('Select where', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', 'EQUALS', 'x').buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" = $1');
  });

  test('Select where expression', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable')
      .column('id')
      .whereExpr(new Condition('name', 'EQUALS', 'x'))
      .buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "name" = $1');
  });

  test('Select where negation', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable')
      .column('id')
      .whereExpr(new Negation(new Condition('name', 'EQUALS', 'x')))
      .buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE NOT ("name" = $1)');
  });

  test('Select where array contains', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', 'ARRAY_CONTAINS', 'x').buildSql(sql);
    expect(sql.toString()).toBe(
      'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name" && ARRAY[$1])'
    );
  });

  test('Select where array contains array', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', 'ARRAY_CONTAINS', ['x', 'y']).buildSql(sql);
    expect(sql.toString()).toBe(
      'SELECT "MyTable"."id" FROM "MyTable" WHERE ("MyTable"."name" IS NOT NULL AND "MyTable"."name" && ARRAY[$1,$2])'
    );
  });

  test('Select where is null', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', 'EQUALS', null).buildSql(sql);
    expect(sql.toString()).toBe('SELECT "MyTable"."id" FROM "MyTable" WHERE "MyTable"."name" IS NULL');
  });

  test('Select where is not null', () => {
    const sql = new SqlBuilder();
    new SelectQuery('MyTable').column('id').where('name', 'NOT_EQUALS', null).buildSql(sql);
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
});
