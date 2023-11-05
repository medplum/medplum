import { AsyncLocalStorage } from 'async_hooks';
import { Client, Pool, PoolClient } from 'pg';
import Cursor from 'pg-cursor';
import { env } from 'process';

const DEBUG = env['SQL_DEBUG'];

export enum ColumnType {
  UUID = 'uuid',
  TIMESTAMP = 'timestamp',
  TEXT = 'text',
}

export type OperatorFunc = (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => void;

export const Operator = {
  '=': (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    if (parameter === null) {
      sql.append(' IS NULL');
    } else {
      sql.append(' = ');
      sql.appendParameters(parameter, true);
    }
  },
  '!=': (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    if (parameter === null) {
      sql.append(' IS NOT NULL');
    } else {
      sql.append(' <> ');
      sql.appendParameters(parameter, true);
    }
  },
  LIKE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append('LOWER(');
    sql.appendColumn(column);
    sql.append(')');
    sql.append(' LIKE ');
    sql.param((parameter as string).toLowerCase());
  },
  NOT_LIKE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append('LOWER(');
    sql.appendColumn(column);
    sql.append(')');
    sql.append(' NOT LIKE ');
    sql.param((parameter as string).toLowerCase());
  },
  '<': simpleBinaryOperator('<'),
  '<=': simpleBinaryOperator('<='),
  '>': simpleBinaryOperator('>'),
  '>=': simpleBinaryOperator('>='),
  IN: simpleBinaryOperator('IN'),
  ARRAY_CONTAINS: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.append('(');
    sql.appendColumn(column);
    sql.append(' IS NOT NULL AND ');
    sql.appendColumn(column);
    sql.append(' && ARRAY[');
    sql.appendParameters(parameter, false);
    sql.append(']');
    if (paramType) {
      sql.append('::' + paramType);
    }
    sql.append(')');
  },
  TSVECTOR_SIMPLE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append(`to_tsvector('simple',`);
    sql.appendColumn(column);
    sql.append(')');
    sql.append(` @@ to_tsquery('simple',`);
    sql.param(parameter);
    sql.append(')');
  },
  TSVECTOR_ENGLISH: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append(`to_tsvector('english',`);
    sql.appendColumn(column);
    sql.append(')');
    sql.append(` @@ to_tsquery('english',`);
    sql.param(parameter);
    sql.append(')');
  },
  IN_SUBQUERY: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append('=ANY(');
    if (paramType) {
      sql.append('(');
    }
    (parameter as SelectQuery).buildSql(sql);
    if (paramType) {
      sql.append(')::' + paramType);
    }
    sql.append(')');
  },
  LINK: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    sql.append('::TEXT = SPLIT_PART(');
    sql.appendColumn(parameter as Column);
    sql.append(`,'/',2)`);
  },
  REVERSE_LINK: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append(` = '${paramType}/'`);
    sql.append('||');
    sql.appendColumn(parameter as Column);
  },
};

function simpleBinaryOperator(operator: string): OperatorFunc {
  return (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    sql.append(` ${operator} `);
    sql.appendParameters(parameter, true);
  };
}

export class Column {
  constructor(
    readonly tableName: string | undefined,
    readonly columnName: string,
    readonly raw?: boolean
  ) {}
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
    readonly operator: keyof typeof Operator,
    readonly parameter: any,
    readonly parameterType?: string
  ) {
    this.column = getColumn(column);
  }

  buildSql(sql: SqlBuilder): void {
    const operator = Operator[this.operator];
    if (!operator) {
      throw new Error('Unrecognized SQL operator: ' + this.operator);
    }
    operator(sql, this.column, this.parameter, this.parameterType);
  }
}

export abstract class Connective implements Expression {
  constructor(
    readonly keyword: string,
    readonly expressions: Expression[]
  ) {}

  whereExpr(expression: Expression): this {
    this.expressions.push(expression);
    return this;
  }

  where(column: Column | string, operator?: keyof typeof Operator, value?: any, type?: string): this {
    return this.whereExpr(new Condition(column, operator as keyof typeof Operator, value, type));
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
  constructor(
    readonly joinType: 'LEFT JOIN' | 'INNER JOIN',
    readonly joinItem: string | SelectQuery,
    readonly joinAlias: string,
    readonly onExpression: Expression
  ) {}
}

export class GroupBy {
  constructor(readonly column: Column) {}
}

export class OrderBy {
  constructor(
    readonly column: Column,
    readonly descending?: boolean
  ) {}
}

export interface Expression {
  buildSql(sql: SqlBuilder): void;
}

export class SqlBuilder {
  private readonly sql: string[];
  private readonly values: any[];

  constructor() {
    this.sql = [];
    this.values = [];
  }

  append(value: any): this {
    this.sql.push(value.toString());
    return this;
  }

  appendIdentifier(str: string): this {
    this.sql.push('"', str, '"');
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
      this.values.push(value);
      this.sql.push('$' + this.values.length);
    }
    return this;
  }

  appendParameters(parameter: any, addParens: boolean): void {
    if (Array.isArray(parameter) || parameter instanceof Set) {
      if (addParens) {
        this.append('(');
      }
      let i = 0;
      for (const value of parameter) {
        if (i++) {
          this.append(',');
        }
        this.param(value);
      }
      if (addParens) {
        this.append(')');
      }
    } else {
      this.param(parameter);
    }
  }

  toString(): string {
    return this.sql.join('');
  }

  getValues(): any[] {
    return this.values;
  }

  async execute(conn: Client | Pool | PoolClient): Promise<any[]> {
    const sql = this.toString();
    let startTime = 0;
    if (DEBUG) {
      console.log('sql', sql);
      console.log('values', this.values);
      startTime = Date.now();
    }
    const result = await conn.query(sql, this.values);
    if (DEBUG) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      console.log(`result: ${result.rows.length} rows (${duration} ms)`);
    }
    return result.rows;
  }
}

export abstract class BaseQuery {
  readonly tableName: string;
  readonly predicate: Conjunction;
  explain = false;

  constructor(tableName: string) {
    this.tableName = tableName;
    this.predicate = new Conjunction([]);
  }

  whereExpr(expression: Expression): this {
    this.predicate.whereExpr(expression);
    return this;
  }

  where(column: Column | string, operator?: keyof typeof Operator, value?: any, type?: string): this {
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
  joinCount = 0;

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
    this.joinCount++;
    return `T${this.joinCount}`;
  }

  innerJoin(joinItem: string | SelectQuery, joinAlias: string, onExpression: Expression): this {
    this.joins.push(new Join('INNER JOIN', joinItem, joinAlias, onExpression));
    return this;
  }

  leftJoin(joinItem: string | SelectQuery, joinAlias: string, onExpression: Expression): this {
    this.joins.push(new Join('LEFT JOIN', joinItem, joinAlias, onExpression));
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
    if (this.explain) {
      sql.append('EXPLAIN ');
    }
    sql.append('SELECT ');
    this.buildDistinctOn(sql);
    this.buildColumns(sql);
    this.buildFrom(sql);
    this.buildConditions(sql);
    this.buildGroupBy(sql);
    this.buildOrderBy(sql);

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
    callback = AsyncLocalStorage.bind(callback);
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

  private buildDistinctOn(sql: SqlBuilder): void {
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

  private buildColumns(sql: SqlBuilder): void {
    let first = true;
    for (const column of this.columns) {
      if (!first) {
        sql.append(', ');
      }
      sql.appendColumn(column);
      first = false;
    }
  }

  private buildFrom(sql: SqlBuilder): void {
    sql.append(' FROM ');
    sql.appendIdentifier(this.tableName);

    for (const join of this.joins) {
      sql.append(` ${join.joinType} `);
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

  private buildGroupBy(sql: SqlBuilder): void {
    let first = true;

    for (const groupBy of this.groupBys) {
      sql.append(first ? ' GROUP BY ' : ', ');
      sql.appendColumn(groupBy.column);
      first = false;
    }
  }

  private buildOrderBy(sql: SqlBuilder): void {
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

export class ArraySubquery implements Expression {
  private filter: Expression;
  private column: Column;

  constructor(column: Column, filter: Expression) {
    this.filter = filter;
    this.column = column;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('EXISTS(SELECT 1 FROM unnest(');
    sql.appendColumn(this.column);
    sql.append(') AS ');
    sql.appendIdentifier(this.column.columnName);
    sql.append(' WHERE ');
    this.filter.buildSql(sql);
    sql.append(' LIMIT 1');
    sql.append(')');
  }
}

export class InsertQuery extends BaseQuery {
  private readonly values: Record<string, any>[];
  private merge?: boolean;

  constructor(tableName: string, values: Record<string, any>[]) {
    super(tableName);
    this.values = values;
  }

  mergeOnConflict(merge: boolean): this {
    this.merge = merge;
    return this;
  }

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    const sql = new SqlBuilder();
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.tableName);
    const columnNames = Object.keys(this.values[0]);
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
    for (let i = 0; i < this.values.length; i++) {
      if (i === 0) {
        sql.append(' VALUES ');
      } else {
        sql.append(', ');
      }
      this.appendValues(sql, columnNames, this.values[i]);
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
    if (!this.merge) {
      return;
    }

    sql.append(' ON CONFLICT ("id") DO UPDATE SET ');

    const entries = Object.entries(this.values[0]);
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
