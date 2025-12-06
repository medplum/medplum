// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError, append, conflict, normalizeOperationOutcome, serverTimeout } from '@medplum/core';
import type { Period } from '@medplum/fhirtypes';
import { env } from 'node:process';
import type { Client, Pool, PoolClient } from 'pg';
import { getLogger } from '../logger';

let DEBUG: string | undefined = env['SQL_DEBUG'];

export function setSqlDebug(value: string | undefined): void {
  DEBUG = value;
}

export function resetSqlDebug(): void {
  DEBUG = env['SQL_DEBUG'];
}

export const ColumnType = {
  UUID: 'uuid',
  TIMESTAMP: 'timestamp',
  TEXT: 'text',
  TSTZRANGE: 'tstzrange',
} as const;
export type ColumnType = (typeof ColumnType)[keyof typeof ColumnType];

export type OperatorFunc = (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => void;

export type TransactionIsolationLevel = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

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
  LOWER_LIKE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append('LOWER(');
    sql.appendColumn(column);
    sql.append(')');
    sql.append(' LIKE ');
    sql.param((parameter as string).toLowerCase());
  },
  ILIKE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    sql.append(' ILIKE ');
    sql.param(parameter as string);
  },
  '<': simpleBinaryOperator('<'),
  '<=': simpleBinaryOperator('<='),
  '>': simpleBinaryOperator('>'),
  '>=': simpleBinaryOperator('>='),
  IN: simpleBinaryOperator('IN'),
  /*
    Why do both of these exist? Mainly for consideration when negating the condition:
    Negating ARRAY_OVERLAPS_AND_IS_NOT_NULL includes records where the column is NULL.
    Negating ARRAY_OVERLAPS does NOT include records where the column is NULL.
  */
  ARRAY_OVERLAPS: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    // && is the overlap operator, @> is the contains operator
    // When `parameter` is a single value, @> is functionally equivalent to && and
    // can lead to better query plans
    if (sql.parameterCount(parameter) > 1) {
      sql.append(' && ARRAY[');
    } else {
      sql.append(' @> ARRAY[');
    }
    sql.appendParameters(parameter, false);
    sql.append(']');
    if (paramType) {
      sql.append('::' + paramType);
    }
  },
  ARRAY_OVERLAPS_AND_IS_NOT_NULL: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.append('(');
    sql.appendColumn(column);
    sql.append(' IS NOT NULL AND ');
    sql.appendColumn(column);
    // && is the overlap operator, @> is the contains operator
    // When `parameter` is a single value, @> is functionally equivalent to && and
    // can lead to better query plans
    if (sql.parameterCount(parameter) > 1) {
      sql.append(' && ARRAY[');
    } else {
      sql.append(' @> ARRAY[');
    }
    sql.appendParameters(parameter, false);
    sql.append(']');
    if (paramType) {
      sql.append('::' + paramType);
    }
    sql.append(')');
  },
  TOKEN_ARRAY_IREGEX: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.append(`${TokenArrayToTextFn.name}(`);
    sql.appendColumn(column);
    sql.append(')');
    sql.append(' ~* ');
    sql.appendParameters(parameter, false);
  },
  ARRAY_EMPTY: (sql: SqlBuilder, column: Column, _parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append(' = ARRAY[]');
    if (paramType) {
      sql.append('::' + paramType);
    }
  },
  ARRAY_NOT_EMPTY: (sql: SqlBuilder, column: Column, _parameter: any, _paramType?: string) => {
    sql.append('array_length(');
    sql.appendColumn(column);
    sql.append(', 1) > 0');
  },
  TSVECTOR_SIMPLE: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    const query = formatTsquery(parameter);
    if (!query) {
      sql.append('true');
      return;
    }

    sql.append(`to_tsvector('simple',`);
    sql.appendColumn(column);
    sql.append(`) @@ to_tsquery('simple',`);
    sql.param(query);
    sql.append(')');
  },
  TSVECTOR_ENGLISH: (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    const query = formatTsquery(parameter);
    if (!query) {
      sql.append('true');
      return;
    }

    sql.append(`to_tsvector('english',`);
    sql.appendColumn(column);
    sql.append(`) @@ to_tsquery('english',`);
    sql.param(query);
    sql.append(')');
  },
  IN_SUBQUERY: (sql: SqlBuilder, column: Column, expression: Expression, expressionType?: string) => {
    sql.appendColumn(column);
    sql.append('=ANY(');
    if (expressionType) {
      sql.append('(');
    }
    sql.appendExpression(expression);
    if (expressionType) {
      sql.append(')::' + expressionType);
    }
    sql.append(')');
  },
  RANGE_OVERLAPS: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append(' && ');
    sql.param(parameter);
    if (paramType) {
      sql.append('::' + paramType);
    }
  },
  RANGE_STRICTLY_RIGHT_OF: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append(' >> ');
    sql.param(parameter);
    if (paramType) {
      sql.append('::' + paramType);
    }
  },
  RANGE_STRICTLY_LEFT_OF: (sql: SqlBuilder, column: Column, parameter: any, paramType?: string) => {
    sql.appendColumn(column);
    sql.append(' << ');
    sql.param(parameter);
    if (paramType) {
      sql.append('::' + paramType);
    }
  },
};

function simpleBinaryOperator(operator: string): OperatorFunc {
  return (sql: SqlBuilder, column: Column, parameter: any, _paramType?: string) => {
    sql.appendColumn(column);
    sql.append(` ${operator} `);
    sql.appendParameters(parameter, true);
  };
}

export function escapeLikeString(str: string): string {
  return str.replaceAll(/[\\_%]/g, (c) => '\\' + c);
}

function formatTsquery(filter: string | undefined): string | undefined {
  if (!filter) {
    return undefined;
  }

  const noPunctuation = filter.replaceAll(/[^\p{Letter}\p{Number}-]/gu, ' ').trim();
  if (!noPunctuation) {
    return undefined;
  }

  return noPunctuation.replaceAll(/\s+/g, ':* & ') + ':*';
}

export interface Expression {
  buildSql(builder: SqlBuilder): void;
}

abstract class Executable implements Expression {
  buildSql(_builder: SqlBuilder): void {
    throw new Error('Method not implemented');
  }

  async execute<T = any>(conn: Pool | PoolClient): Promise<T[]> {
    const sql = new SqlBuilder();
    sql.appendExpression(this);
    return (await sql.execute(conn)).rows;
  }
}

export class Column implements Expression {
  readonly tableName: string | undefined;
  actualColumnName: string;
  readonly raw?: boolean;
  readonly alias?: string;

  constructor(tableName: string | undefined, columnName: string, raw?: boolean, alias?: string) {
    this.tableName = tableName;
    this.actualColumnName = columnName;
    this.raw = raw;
    this.alias = alias;
  }

  /**
   * @returns - the column name to be used in the SQL query.
   * This is the alias if provided, otherwise the actual column name.
   */
  get effectiveColumnName(): string {
    return this.alias || this.actualColumnName;
  }

  buildSql(sql: SqlBuilder): void {
    sql.appendColumn(this);
  }
}

export class Constant implements Expression {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append(this.value);
  }
}

export class Parameter implements Expression {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }

  buildSql(sql: SqlBuilder): void {
    sql.param(this.value);
  }
}

export class Negation implements Expression {
  readonly expression: Expression;

  constructor(expression: Expression) {
    this.expression = expression;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('NOT (');
    sql.appendExpression(this.expression);
    sql.append(')');
  }
}

export class Condition implements Expression {
  readonly column: Column;
  readonly operator: keyof typeof Operator;
  parameter: any;
  readonly parameterType?: string;

  constructor(column: Column | string, operator: keyof typeof Operator, parameter: any, parameterType?: string) {
    if (
      (operator === 'ARRAY_OVERLAPS_AND_IS_NOT_NULL' || operator === 'ARRAY_OVERLAPS' || operator === 'ARRAY_EMPTY') &&
      !parameterType
    ) {
      throw new Error(`${operator} requires paramType`);
    }

    this.column = getColumn(column);
    this.operator = operator;
    this.parameter = parameter;
    this.parameterType = parameterType;
  }

  buildSql(sql: SqlBuilder): void {
    const operator = Operator[this.operator];
    operator(sql, this.column, this.parameter, this.parameterType);
  }
}

export class TypedCondition<T extends keyof typeof Operator> extends Condition {
  readonly operator: T;
  readonly parameter: Parameters<(typeof Operator)[T]>[2];
  readonly parameterType?: string;
  constructor(
    column: Column | string,
    operator: T,
    parameter: Parameters<(typeof Operator)[T]>[2],
    parameterType?: string
  ) {
    super(column, operator, parameter, parameterType);
    this.operator = operator;
    this.parameter = parameter;
    this.parameterType = parameterType;
  }
}

export abstract class Connective implements Expression {
  readonly keyword: string;
  readonly expressions: Expression[];

  constructor(keyword: string, expressions: Expression[]) {
    this.keyword = keyword;
    this.expressions = expressions;
  }

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
      builder.appendExpression(expr);
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

export class SqlFunction implements Expression {
  readonly name: string;
  readonly args: (Expression | Column)[];

  constructor(name: string, args: (Expression | Column)[]) {
    this.name = name;
    this.args = args;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append(this.name + '(');
    for (let i = 0; i < this.args.length; i++) {
      const arg = this.args[i];
      sql.appendExpression(arg);
      if (i + 1 < this.args.length) {
        sql.append(', ');
      }
    }
    sql.append(')');
  }
}

export class UnionAllBuilder {
  private queryCount: number = 0;
  sql: SqlBuilder;

  constructor() {
    this.sql = new SqlBuilder();
  }

  add(query: SelectQuery): void {
    if (this.queryCount > 0) {
      this.sql.append(' UNION ALL ');
    }
    this.sql.append('(');
    this.sql.appendExpression(query);
    this.sql.append(')');
    this.queryCount++;
  }

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    return (await this.sql.execute(conn)).rows;
  }
}

export class Union extends Executable implements Expression {
  readonly queries: SelectQuery[];
  private allFlag = false;

  constructor(...queries: SelectQuery[]) {
    super();
    this.queries = queries;
  }

  all(): this {
    this.allFlag = true;
    return this;
  }

  buildSql(sql: SqlBuilder): void {
    for (let i = 0; i < this.queries.length; i++) {
      if (i > 0) {
        sql.append(' UNION ');
        if (this.allFlag) {
          sql.append('ALL ');
        }
      }
      sql.appendExpression(this.queries[i]);
    }
  }
}

export type JoinType = 'INNER JOIN' | 'LEFT JOIN' | 'INNER JOIN LATERAL' | 'LEFT JOIN LATERAL';

export class Join {
  readonly joinType: JoinType;
  readonly joinItem: SelectQuery | string;
  readonly joinAlias: string;
  readonly onExpression: Expression;

  constructor(joinType: JoinType, joinItem: SelectQuery | string, joinAlias: string, onExpression: Expression) {
    this.joinType = joinType;
    this.joinItem = joinItem;
    this.joinAlias = joinAlias;
    this.onExpression = onExpression;
  }
}

export class GroupBy {
  readonly column: Column;

  constructor(column: Column) {
    this.column = column;
  }
}

export class OrderBy {
  readonly key: Column | Expression;
  readonly descending?: boolean;

  constructor(key: Column | Expression, descending?: boolean) {
    this.key = key;
    this.descending = descending;
  }
}

export class SqlBuilder {
  private readonly sql: string[];
  private readonly values: any[];
  debug = DEBUG;

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
      this.append(column.actualColumnName);
    } else {
      if (column.tableName) {
        this.appendIdentifier(column.tableName);
        this.append('.');
      }
      this.appendIdentifier(column.actualColumnName);
    }
    if (column.alias) {
      this.append(' AS ');
      this.appendIdentifier(column.alias);
    }
    return this;
  }

  appendExpression(expr: Expression): this {
    expr.buildSql(this);
    return this;
  }

  param(value: any): this {
    if (value instanceof Column) {
      this.appendColumn(value);
    } else if (value === null || value === undefined) {
      this.append('NULL');
    } else {
      this.values.push(value);
      this.sql.push('$' + this.values.length);
    }
    return this;
  }

  parameterCount(value: any): number {
    if (Array.isArray(value)) {
      return value.length;
    }
    if (value instanceof Set) {
      return value.size;
    }
    return 1;
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

  async execute(conn: Client | Pool | PoolClient): Promise<{ rowCount: number; rows: any[] }> {
    const sql = this.toString();
    let startTime = 0;
    if (this.debug) {
      console.log('sql', sql);
      console.log('values', this.values);
      startTime = Date.now();
    }
    try {
      const result = await conn.query(sql, this.values);
      if (this.debug) {
        const endTime = Date.now();
        const duration = endTime - startTime;
        console.log(`result: ${result.rowCount ?? 0} rows (${duration} ms)`);
      }

      return { rowCount: result.rowCount ?? 0, rows: result.rows };
    } catch (err) {
      throw normalizeDatabaseError(err);
    }
  }
}

export const PostgresError = {
  UniqueViolation: '23505',
  SerializationFailure: '40001',
  QueryCanceled: '57014',
  InFailedSqlTransaction: '25P02',
} as const;

export function normalizeDatabaseError(err: any): OperationOutcomeError {
  if (err instanceof OperationOutcomeError) {
    // Pass through already-normalized errors
    return err;
  }

  // Handle known Postgres error codes
  // @see https://www.postgresql.org/docs/16/errcodes-appendix.html
  switch (err?.code) {
    case PostgresError.UniqueViolation:
      // Duplicate key error -> 409 Conflict
      // @see https://github.com/brianc/node-postgres/issues/1602
      return new OperationOutcomeError(conflict(err.detail), err);
    case PostgresError.SerializationFailure:
      // Transaction rollback due to serialization error -> 409 Conflict
      return new OperationOutcomeError(conflict(err.message, err.code), err);
    case PostgresError.QueryCanceled:
      // Statement timeout -> 504 Gateway Timeout
      getLogger().warn('Database statement timeout', { error: err.message, stack: err.stack, code: err.code });
      return new OperationOutcomeError(serverTimeout(err.message), err);
    case PostgresError.InFailedSqlTransaction:
      getLogger().warn('Statement in failed transaction', { stack: err.stack });
      return new OperationOutcomeError(normalizeOperationOutcome(err), err);
  }

  getLogger().error('Database error', { error: err.message, stack: err.stack, code: err.code });
  return new OperationOutcomeError(normalizeOperationOutcome(err), err);
}

export abstract class BaseQuery extends Executable {
  readonly actualTableName: string;
  readonly predicate: Conjunction;
  explain: boolean | string[] = false;

  constructor(tableName: string) {
    super();
    this.actualTableName = tableName;
    this.predicate = new Conjunction([]);
  }

  /**
   * @returns - the table name to be used in the SQL query.
   * This is the alias if provided, otherwise the actual table name.
   */
  get effectiveTableName(): string {
    return this.actualTableName;
  }

  whereExpr(expression: Expression): this {
    this.predicate.whereExpr(expression);
    return this;
  }

  where(column: Column | string, operator?: keyof typeof Operator, value?: any, type?: string): this {
    this.predicate.where(getColumn(column, this.actualTableName), operator, value, type);
    return this;
  }

  protected buildConditions(sql: SqlBuilder): void {
    if (this.predicate.expressions.length > 0) {
      sql.append(' WHERE ');
      sql.appendExpression(this.predicate);
    }
  }
}

export interface CTE {
  name: string;
  expr: Expression;
  recursive?: boolean;
}

export class SelectQuery extends BaseQuery {
  readonly innerQuery?: BaseQuery | Union | ValuesQuery;
  readonly distinctOns: Column[];
  readonly columns: Column[];
  readonly joins: Join[];
  readonly groupBys: GroupBy[];
  readonly orderBys: OrderBy[];
  private readonly alias?: string;
  with?: CTE;
  limit_: number;
  offset_: number;
  joinCount = 0;

  constructor(tableName: string, innerQuery?: BaseQuery | Union | ValuesQuery, alias?: string) {
    super(tableName);
    this.innerQuery = innerQuery;
    this.distinctOns = [];
    this.columns = [];
    this.joins = [];
    this.groupBys = [];
    this.orderBys = [];
    this.alias = alias;
    this.limit_ = 0;
    this.offset_ = 0;
  }

  get effectiveTableName(): string {
    return this.alias || this.actualTableName;
  }

  withCte(name: string, expr: Expression): this {
    this.with = { name, expr };
    return this;
  }

  withRecursive(name: string, expr: Expression): this {
    this.with = { name, expr, recursive: true };
    return this;
  }

  distinctOn(column: Column | string): this {
    this.distinctOns.push(getColumn(column, this.effectiveTableName));
    return this;
  }

  raw(column: string): this {
    this.columns.push(new Column(undefined, column, true));
    return this;
  }

  column(column: Column | string): this {
    this.columns.push(getColumn(column, this.effectiveTableName));
    return this;
  }

  addColumns(columns: Column[]): this {
    for (const col of columns) {
      this.columns.push(new Column(this.effectiveTableName, col.effectiveColumnName));
    }
    return this;
  }

  getNextJoinAlias(): string {
    this.joinCount++;
    return `T${this.joinCount}`;
  }

  join(joinType: JoinType, joinItem: SelectQuery | string, joinAlias: string, onExpression: Expression): this {
    this.joins.push(new Join(joinType, joinItem, joinAlias, onExpression));
    return this;
  }

  groupBy(column: Column | string): this {
    this.groupBys.push(new GroupBy(getColumn(column, this.effectiveTableName)));
    return this;
  }

  orderBy(column: Column | string, descending?: boolean): this {
    this.orderBys.push(new OrderBy(getColumn(column, this.effectiveTableName), descending));
    return this;
  }

  orderByExpr(expr: Expression, descending?: boolean): this {
    this.orderBys.push(new OrderBy(expr, descending));
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
      if (Array.isArray(this.explain)) {
        sql.append('(');
        sql.append(this.explain.join(', '));
        sql.append(')');
      }
    }
    if (this.with) {
      sql.append('WITH ');
      if (this.with.recursive) {
        sql.append('RECURSIVE ');
      }
      sql.appendIdentifier(this.with.name);
      sql.append(' AS (');
      sql.appendExpression(this.with.expr);
      sql.append(') ');
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
    if (this.columns.length === 0) {
      sql.append('1');
      return;
    }

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

    if (this.innerQuery) {
      sql.append('(');
      sql.appendExpression(this.innerQuery);
      sql.append(') AS ');
    }

    sql.appendIdentifier(this.actualTableName);
    if (this.alias) {
      sql.append(' ');
      sql.appendIdentifier(this.alias);
      sql.append(' ');
    }

    for (const join of this.joins) {
      sql.append(` ${join.joinType} `);
      if (join.joinItem instanceof SelectQuery) {
        sql.append('(');
        sql.appendExpression(join.joinItem);
        sql.append(')');
      } else {
        sql.appendIdentifier(join.joinItem);
      }
      sql.append(' AS ');
      sql.appendIdentifier(join.joinAlias);
      sql.append(' ON ');
      sql.appendExpression(join.onExpression);
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
      sql.appendExpression(orderBy.key);
      if (orderBy.descending) {
        sql.append(' DESC');
      }
      first = false;
    }
  }
}

export class ArraySubquery implements Expression {
  private readonly filter: Expression;
  private readonly column: Column;

  constructor(column: Column, filter: Expression) {
    this.filter = filter;
    this.column = column;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('EXISTS(SELECT 1 FROM unnest(');
    sql.appendColumn(this.column);
    sql.append(') AS ');
    sql.appendIdentifier(this.column.effectiveColumnName);
    sql.append(' WHERE ');
    sql.appendExpression(this.filter);
    sql.append(' LIMIT 1');
    sql.append(')');
  }
}

export class UpdateQuery extends BaseQuery {
  private _from?: CTE;
  private readonly setColumns: [Column, any][];
  readonly returning?: Column[];

  constructor(tableName: string, returning?: (Column | string)[]) {
    super(tableName);
    this.setColumns = [];
    this.returning = returning?.map((c) => getColumn(c, this.actualTableName));
  }

  set(column: Column | string, value: any): this {
    // Including the table name is invalid; from the spec:
    // Do not include the table's name in the specification of a target column — for example,
    // UPDATE table_name SET table_name.col = 1 is invalid.
    if (column instanceof Column) {
      this.setColumns.push([new Column(undefined, column.actualColumnName), value]);
    } else {
      this.setColumns.push([new Column(undefined, column), value]);
    }
    return this;
  }

  from(fromQuery: CTE): this {
    this._from = fromQuery;
    return this;
  }

  buildSql(sql: SqlBuilder): void {
    if (this._from) {
      sql.append('WITH ');
      if (this._from.recursive) {
        sql.append('RECURSIVE ');
      }
      sql.appendIdentifier(this._from.name);
      sql.append(' AS (');
      sql.appendExpression(this._from.expr);
      sql.append(') ');
    }
    sql.append('UPDATE ');
    sql.appendIdentifier(this.actualTableName);
    sql.append(' SET ');

    let firstSet = true;
    for (const [column, expr] of this.setColumns) {
      if (!firstSet) {
        sql.append(', ');
      }
      sql.appendColumn(column);
      sql.append(' = ');
      sql.appendParameters(expr, false);
      firstSet = false;
    }

    if (this._from) {
      sql.append(' FROM ');
      sql.appendIdentifier(this._from.name);
    }

    if (this.predicate.expressions.length > 0) {
      sql.append(' WHERE ');
      sql.appendExpression(this.predicate);
    }

    if (this.returning && this.returning.length > 0) {
      sql.append(' RETURNING ');
      let first = true;
      for (const column of this.returning) {
        if (!first) {
          sql.append(', ');
        }
        sql.appendColumn(column);
        first = false;
      }
    }
  }
}

export class InsertQuery extends BaseQuery {
  private readonly values?: Record<string, any>[];
  private readonly query?: SelectQuery;
  private returnColumns?: string[];
  private conflictColumns?: string[];
  private conflictCondition?: Condition;
  private ignoreConflict?: boolean;

  constructor(tableName: string, values: Record<string, any>[] | SelectQuery) {
    super(tableName);
    if (Array.isArray(values)) {
      this.values = values;
    } else {
      this.query = values;
    }
  }

  mergeOnConflict(columns?: string[], where?: Condition): this {
    this.conflictColumns = columns ?? ['id'];
    if (where) {
      this.conflictCondition = where;
    }
    return this;
  }

  ignoreOnConflict(): this {
    this.ignoreConflict = true;
    return this;
  }

  returnColumn(column: Column | string): this {
    this.returnColumns = append(this.returnColumns, column instanceof Column ? column.effectiveColumnName : column);
    return this;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.actualTableName);
    if (this.values) {
      const columnNames = Object.keys(this.values[0]);
      this.appendColumns(sql, columnNames);
      this.appendAllValues(sql, columnNames);
    } else {
      this.appendSubquery(sql);
    }
    this.appendMerge(sql);
    if (this.returnColumns) {
      sql.append(` RETURNING ${this.returnColumns.join(', ')}`);
    }
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
    if (!this.values) {
      return;
    }

    for (let i = 0; i < this.values.length; i++) {
      if (i === 0) {
        sql.append(' VALUES ');
      } else {
        sql.append(', ');
      }
      this.appendValues(sql, columnNames, this.values[i]);
    }
  }

  private appendSubquery(sql: SqlBuilder): void {
    if (!this.query) {
      return;
    }
    sql.append(' ');
    sql.appendExpression(this.query);
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
    if (this.ignoreConflict) {
      sql.append(` ON CONFLICT DO NOTHING`);
      return;
    } else if (!this.conflictColumns?.length || !this.values) {
      return;
    }

    sql.append(` ON CONFLICT (`);
    sql.append(this.conflictColumns.map((c) => '"' + c + '"').join(', '));
    sql.append(`)`);
    if (this.conflictCondition) {
      sql.append(' WHERE ');
      sql.appendExpression(this.conflictCondition);
    }
    sql.append(` DO UPDATE SET `);

    const columns = Object.keys(this.values[0]);
    let first = true;
    for (const columnName of columns) {
      if (this.conflictColumns.includes(columnName)) {
        continue;
      }
      if (!first) {
        sql.append(', ');
      }
      sql.appendIdentifier(columnName);
      sql.append('= EXCLUDED.');
      sql.appendIdentifier(columnName);
      first = false;
    }
  }

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    if (!this.values?.length) {
      return [];
    }
    return super.execute(conn);
  }
}

export class DeleteQuery extends BaseQuery {
  usingTables?: string[];

  using(...tableNames: string[]): this {
    for (const table of tableNames) {
      this.usingTables = append(this.usingTables, table);
    }
    return this;
  }

  buildSql(sql: SqlBuilder): void {
    sql.append('DELETE FROM ');
    sql.appendIdentifier(this.actualTableName);

    if (this.usingTables) {
      sql.append(' USING ');
      let first = true;
      for (const tableName of this.usingTables) {
        if (!first) {
          sql.append(', ');
        }
        sql.appendIdentifier(tableName);
        first = false;
      }
    }

    this.buildConditions(sql);
  }
}

export class ValuesQuery implements Expression {
  readonly tableName: string;
  readonly columnNames: string[];
  readonly rows: any[][];
  constructor(tableName: string, columnNames: string[], rows: any[][]) {
    this.tableName = tableName;
    this.columnNames = columnNames;
    this.rows = rows;
  }

  buildSql(builder: SqlBuilder): void {
    /*
    Since a VALUES expression has a special alias format of "tableName"("columnName"),
    wrap its sql with SELECT * FROM (VALUES ...) AS "tableName"("columnName") for compatibility
    other query builders that may include a ValuesQuery:

    SELECT * FROM (VALUES
      ('val1'),
		  ('val2'),
		  ('val3'),
    ) AS "values"("val")
    */

    builder.append('SELECT * FROM (VALUES');
    for (let r = 0; r < this.rows.length; r++) {
      builder.append(r === 0 ? '(' : ',(');
      for (let v = 0; v < this.rows[r].length; v++) {
        builder.append(v === 0 ? '' : ',');
        builder.param(this.rows[r][v]);
      }
      builder.append(')');
    }
    builder.append(') AS ');
    builder.appendIdentifier(this.tableName);
    builder.append('(');
    for (let c = 0; c < this.columnNames.length; c++) {
      builder.append(c === 0 ? '' : ',');
      builder.appendIdentifier(this.columnNames[c]);
    }
    builder.append(')');
  }
}

function getColumn(column: Column | string, defaultTableName?: string): Column {
  if (typeof column === 'string') {
    return new Column(defaultTableName, column);
  } else {
    return column;
  }
}

export function periodToRangeString(period: Period): string | undefined {
  if (period.start && period.end) {
    return `[${period.start},${period.end}]`;
  }
  if (period.start) {
    return `[${period.start},]`;
  }
  if (period.end) {
    return `[,${period.end}]`;
  }
  return undefined;
}

export interface SqlFunctionDefinition {
  readonly name: string;
  readonly createQuery: string;
}

/**
 * WARNING: Custom SQL functions should be avoided unless absolutely necessary.
 *
 * This function is necessary since the postgres `array_to_string` function is not IMMUTABLE,
 * but only IMMUTABLE functions can be used in index expressions.
 */
export const TokenArrayToTextFn: SqlFunctionDefinition = {
  name: 'token_array_to_text',
  createQuery: `CREATE FUNCTION token_array_to_text(text[])
    RETURNS text LANGUAGE sql IMMUTABLE
    AS $function$SELECT e'\x03'||array_to_string($1, e'\x03')||e'\x03'$function$`,
};

export function isValidTableName(tableName: string): boolean {
  return /^\w+$/.test(tableName);
}

export function replaceNullWithUndefinedInRows(rows: any[]): void {
  for (const row of rows) {
    for (const k in row) {
      if ((row as any)[k] === null) {
        (row as any)[k] = undefined;
      }
    }
  }
}
