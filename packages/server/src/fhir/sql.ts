import { Client, Pool, PoolClient } from 'pg';
import Cursor from 'pg-cursor';

const DEBUG = false;

export enum ColumnType {
  UUID = 'uuid',
  TIMESTAMP = 'timestamp',
  TEXT = 'text',
}

export enum Operator {
  EQUALS = '=',
  NOT_EQUALS = '<>',
  LIKE = ' LIKE ',
  NOT_LIKE = ' NOT LIKE ',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUALS = '<=',
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUALS = '>=',
  IN = ' IN ',
  ARRAY_CONTAINS = 'ARRAY_CONTAINS',
  TSVECTOR_MATCH = '@@',
  IN_SUBQUERY = 'IN_SUBQUERY',
}

export class Column {
  constructor(readonly tableName: string | undefined, readonly columnName: string, readonly raw?: boolean) {}
}

export interface Expression {
  buildSql(builder: SqlBuilder): void;
}

export class Negation implements Expression {
  constructor(readonly expression: Expression) {}

  buildSql(sql: SqlBuilder): void {
    sql.append('NOT (');
    this.expression.buildSql(sql);
    sql.append(')');
  }
}

export class Condition implements Expression {
  readonly column: Column;
  constructor(
    column: Column | string,
    readonly operator: Operator,
    readonly parameter: any,
    readonly parameterType?: string
  ) {
    this.column = getColumn(column);
  }

  buildSql(sql: SqlBuilder): void {
    if (this.operator === Operator.ARRAY_CONTAINS) {
      this.buildArrayCondition(sql);
    } else if (this.operator === Operator.IN_SUBQUERY) {
      this.buildInSubqueryCondition(sql);
    } else {
      this.buildSimpleCondition(sql);
    }
  }

  protected buildArrayCondition(sql: SqlBuilder): void {
    sql.append('(');
    sql.appendColumn(this.column);
    sql.append(' IS NOT NULL AND ');
    sql.appendColumn(this.column);
    sql.append('&&ARRAY[');
    this.appendParameters(sql, false);
    sql.append(']');
    if (this.parameterType) {
      sql.append('::' + this.parameterType);
    }
    sql.append(')');
  }

  protected buildInSubqueryCondition(sql: SqlBuilder): void {
    sql.appendColumn(this.column);
    sql.append('=ANY(');
    if (this.parameterType) {
      sql.append('(');
    }
    (this.parameter as SelectQuery).buildSql(sql);
    if (this.parameterType) {
      sql.append(')::' + this.parameterType);
    }
    sql.append(')');
  }

  protected buildSimpleCondition(sql: SqlBuilder): void {
    if (this.operator === Operator.LIKE) {
      sql.append('LOWER(');
      sql.appendColumn(this.column);
      sql.append(')');
      sql.append(this.operator);
      sql.param((this.parameter as string).toLowerCase());
    } else if (this.operator === Operator.TSVECTOR_MATCH) {
      sql.appendColumn(this.column);
      sql.append(" @@ to_tsquery('english',");
      sql.param(this.parameter);
      sql.append(')');
    } else if (this.operator === Operator.EQUALS && this.parameter === null) {
      sql.appendColumn(this.column);
      sql.append(' IS NULL');
    } else if (this.operator === Operator.NOT_EQUALS && this.parameter === null) {
      sql.appendColumn(this.column);
      sql.append(' IS NOT NULL');
    } else {
      sql.appendColumn(this.column);
      sql.append(this.operator);
      this.appendParameters(sql, true);
    }
  }

  private appendParameters(sql: SqlBuilder, addParens: boolean): void {
    if (Array.isArray(this.parameter) || this.parameter instanceof Set) {
      if (addParens) {
        sql.append('(');
      }
      let first = true;
      for (const value of this.parameter) {
        if (!first) {
          sql.append(',');
        }
        sql.param(value);
        first = false;
      }
      if (addParens) {
        sql.append(')');
      }
    } else {
      sql.param(this.parameter);
    }
  }
}

export abstract class Connective implements Expression {
  constructor(readonly keyword: string, readonly expressions: Expression[]) {}

  whereExpr(expression: Expression): this {
    this.expressions.push(expression);
    return this;
  }

  where(column: Column | string, operator?: Operator, value?: any, type?: string): this {
    return this.whereExpr(new Condition(column, operator as Operator, value, type));
  }

  buildSql(builder: SqlBuilder): void {
    if (this.expressions.length > 1) {
      builder.append('(');
    }
    let first = true;
    for (const expr of this.expressions) {
      if (!first) {
        builder.append(this.keyword);
      }
      expr.buildSql(builder);
      first = false;
    }
    if (this.expressions.length > 1) {
      builder.append(')');
    }
  }
}

export class Conjunction extends Connective {
  constructor(expressions: Expression[]) {
    super(' AND ', expressions);
  }
}

export class Disjunction extends Connective {
  constructor(expressions: Expression[]) {
    super(' OR ', expressions);
  }
}

export class Join {
  constructor(readonly joinItem: string | SelectQuery, readonly joinAlias: string, readonly onExpression: Expression) {}
}

export class GroupBy {
  constructor(readonly column: Column) {}
}

export class OrderBy {
  constructor(readonly column: Column, readonly descending?: boolean) {}
}

export interface Expression {
  buildSql(sql: SqlBuilder): void;
}

export class SqlBuilder {
  readonly #sql: string[];
  readonly #values: any[];

  constructor() {
    this.#sql = [];
    this.#values = [];
  }

  append(value: any): this {
    this.#sql.push(value.toString());
    return this;
  }

  appendIdentifier(str: string): this {
    this.#sql.push('"', str, '"');
    return this;
  }

  appendColumn(column: Column): this {
    if (column.raw) {
      this.append(column.columnName);
    } else {
      if (column.tableName) {
        this.appendIdentifier(column.tableName);
        this.append('.');
      }
      this.appendIdentifier(column.columnName);
    }
    return this;
  }

  param(value: any): this {
    if (value instanceof Column) {
      this.appendColumn(value);
    } else {
      this.#values.push(value);
      this.#sql.push('$' + this.#values.length);
    }
    return this;
  }

  toString(): string {
    return this.#sql.join('');
  }

  getValues(): any[] {
    return this.#values;
  }

  async execute(conn: Client | Pool | PoolClient): Promise<any[]> {
    const sql = this.toString();
    let startTime = 0;
    if (DEBUG) {
      console.log('sql', sql);
      console.log('values', this.#values);
      startTime = Date.now();
    }
    const result = await conn.query(sql, this.#values);
    if (DEBUG) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log('duration', duration);
    }
    return result.rows;
  }
}

export abstract class BaseQuery {
  readonly tableName: string;
  readonly predicate: Conjunction;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.predicate = new Conjunction([]);
  }

  whereExpr(expression: Expression): this {
    this.predicate.whereExpr(expression);
    return this;
  }

  where(column: Column | string, operator?: Operator, value?: any, type?: string): this {
    this.predicate.where(getColumn(column, this.tableName), operator, value, type);
    return this;
  }

  protected buildConditions(sql: SqlBuilder): void {
    if (this.predicate.expressions.length > 0) {
      sql.append(' WHERE ');
      this.predicate.buildSql(sql);
    }
  }
}

export class SelectQuery extends BaseQuery {
  readonly distinctOns: Column[];
  readonly columns: Column[];
  readonly joins: Join[];
  readonly groupBys: GroupBy[];
  readonly orderBys: OrderBy[];
  limit_: number;
  offset_: number;

  constructor(tableName: string) {
    super(tableName);
    this.distinctOns = [];
    this.columns = [];
    this.joins = [];
    this.groupBys = [];
    this.orderBys = [];
    this.limit_ = 0;
    this.offset_ = 0;
  }

  distinctOn(column: Column | string): this {
    this.distinctOns.push(getColumn(column, this.tableName));
    return this;
  }

  raw(column: string): this {
    this.columns.push(new Column(undefined, column, true));
    return this;
  }

  column(column: Column | string): this {
    this.columns.push(getColumn(column, this.tableName));
    return this;
  }

  getNextJoinAlias(): string {
    return `T${this.joins.length + 1}`;
  }

  join(joinItem: string | SelectQuery, joinAlias: string, onExpression: Expression): this {
    this.joins.push(new Join(joinItem, joinAlias, onExpression));
    return this;
  }

  groupBy(column: Column | string): this {
    this.groupBys.push(new GroupBy(getColumn(column, this.tableName)));
    return this;
  }

  orderBy(column: Column | string, descending?: boolean): this {
    this.orderBys.push(new OrderBy(getColumn(column, this.tableName), descending));
    return this;
  }

  limit(limit: number): this {
    this.limit_ = limit;
    return this;
  }

  offset(offset: number): this {
    this.offset_ = offset;
    return this;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('SELECT ');
    this.#buildDistinctOn(sql);
    this.#buildColumns(sql);
    this.#buildFrom(sql);
    this.buildConditions(sql);
    this.#buildGroupBy(sql);
    this.#buildOrderBy(sql);

    if (this.limit_ > 0) {
      sql.append(' LIMIT ');
      sql.append(this.limit_);
    }

    if (this.offset_ > 0) {
      sql.append(' OFFSET ');
      sql.append(this.offset_);
    }
  }

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    const sql = new SqlBuilder();
    this.buildSql(sql);
    return sql.execute(conn);
  }

  async executeCursor(pool: Pool, callback: (row: any) => Promise<void>): Promise<void> {
    const BATCH_SIZE = 100;

    const sql = new SqlBuilder();
    this.buildSql(sql);

    const client = await pool.connect();
    try {
      const cursor = client.query(new Cursor(sql.toString(), sql.getValues()));
      try {
        let hasMore = true;
        while (hasMore) {
          const rows = await cursor.read(BATCH_SIZE);
          for (const row of rows) {
            await callback(row);
          }
          hasMore = rows.length === BATCH_SIZE;
        }
      } finally {
        await cursor.close();
      }
    } finally {
      client.release();
    }
  }

  #buildDistinctOn(sql: SqlBuilder): void {
    if (this.distinctOns.length > 0) {
      sql.append('DISTINCT ON (');
      let first = true;
      for (const column of this.distinctOns) {
        if (!first) {
          sql.append(', ');
        }
        sql.appendColumn(column);
        first = false;
      }
      sql.append(') ');
    }
  }

  #buildColumns(sql: SqlBuilder): void {
    let first = true;
    for (const column of this.columns) {
      if (!first) {
        sql.append(', ');
      }
      sql.appendColumn(column);
      first = false;
    }
  }

  #buildFrom(sql: SqlBuilder): void {
    sql.append(' FROM ');
    sql.appendIdentifier(this.tableName);

    for (const join of this.joins) {
      sql.append(' LEFT JOIN ');
      if (typeof join.joinItem === 'string') {
        sql.appendIdentifier(join.joinItem);
      } else {
        sql.append(' ( ');
        join.joinItem.buildSql(sql);
        sql.append(' ) ');
      }
      sql.append(' AS ');
      sql.appendIdentifier(join.joinAlias);
      sql.append(' ON ');
      join.onExpression.buildSql(sql);
    }
  }

  #buildGroupBy(sql: SqlBuilder): void {
    let first = true;

    for (const groupBy of this.groupBys) {
      sql.append(first ? ' GROUP BY ' : ', ');
      sql.appendColumn(groupBy.column);
      first = false;
    }
  }

  #buildOrderBy(sql: SqlBuilder): void {
    if (this.orderBys.length === 0) {
      return;
    }

    const combined = [...this.distinctOns.map((d) => new OrderBy(d)), ...this.orderBys];
    let first = true;

    for (const orderBy of combined) {
      sql.append(first ? ' ORDER BY ' : ', ');
      if (orderBy.column.tableName && orderBy.column.tableName !== this.tableName) {
        sql.append('MIN(');
      }
      sql.appendColumn(orderBy.column);
      if (orderBy.column.tableName && orderBy.column.tableName !== this.tableName) {
        sql.append(')');
      }
      if (orderBy.descending) {
        sql.append(' DESC');
      }
      first = false;
    }
  }
}

export class InsertQuery extends BaseQuery {
  readonly #values: Record<string, any>[];
  #merge?: boolean;

  constructor(tableName: string, values: Record<string, any>[]) {
    super(tableName);
    this.#values = values;
  }

  mergeOnConflict(merge: boolean): this {
    this.#merge = merge;
    return this;
  }

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    const sql = new SqlBuilder();
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.tableName);
    const columnNames = Object.keys(this.#values[0]);
    this.appendColumns(sql, columnNames);
    this.appendAllValues(sql, columnNames);
    this.appendMerge(sql);
    return sql.execute(conn);
  }

  private appendColumns(sql: SqlBuilder, columnNames: string[]): void {
    sql.append(' (');
    let first = true;
    for (const columnName of columnNames) {
      if (!first) {
        sql.append(', ');
      }
      sql.appendIdentifier(columnName);
      first = false;
    }
    sql.append(')');
  }

  private appendAllValues(sql: SqlBuilder, columnNames: string[]): void {
    for (let i = 0; i < this.#values.length; i++) {
      if (i === 0) {
        sql.append(' VALUES ');
      } else {
        sql.append(', ');
      }
      this.appendValues(sql, columnNames, this.#values[i]);
    }
  }

  private appendValues(sql: SqlBuilder, columnNames: string[], values: Record<string, any>): void {
    sql.append(' (');
    let first = true;
    for (const columnName of columnNames) {
      if (!first) {
        sql.append(', ');
      }
      sql.param(values[columnName]);
      first = false;
    }
    sql.append(')');
  }

  private appendMerge(sql: SqlBuilder): void {
    if (!this.#merge) {
      return;
    }

    sql.append(' ON CONFLICT ("id") DO UPDATE SET ');

    const entries = Object.entries(this.#values[0]);
    let first = true;
    for (const [columnName, value] of entries) {
      if (columnName === 'id') {
        continue;
      }
      if (!first) {
        sql.append(', ');
      }
      sql.appendIdentifier(columnName);
      sql.append('=');
      sql.param(value);
      first = false;
    }
  }
}

export class DeleteQuery extends BaseQuery {
  async execute(conn: Pool | PoolClient): Promise<any> {
    const sql = new SqlBuilder();
    sql.append('DELETE FROM ');
    sql.appendIdentifier(this.tableName);
    this.buildConditions(sql);
    return sql.execute(conn);
  }
}

function getColumn(column: Column | string, defaultTableName?: string): Column {
  if (typeof column === 'string') {
    return new Column(defaultTableName, column);
  } else {
    return column;
  }
}
