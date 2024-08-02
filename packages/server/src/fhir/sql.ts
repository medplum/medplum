import { OperationOutcomeError, append, conflict } from '@medplum/core';
import { Period } from '@medplum/fhirtypes';
import { Client, Pool, PoolClient } from 'pg';
import { env } from 'process';

const DEBUG = env['SQL_DEBUG'];

export enum ColumnType {
  UUID = 'uuid',
  TIMESTAMP = 'timestamp',
  TEXT = 'text',
  TSTZRANGE = 'tstzrange',
}

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

export class Column {
  constructor(
    readonly tableName: string | undefined,
    readonly columnName: string,
    readonly raw?: boolean,
    readonly alias?: string
  ) {}
}

export class Literal {
  constructor(readonly value: string) {}
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
    if (operator === 'ARRAY_CONTAINS' && !parameterType) {
      throw new Error('ARRAY_CONTAINS requires paramType');
    }

    this.column = getColumn(column);
  }

  buildSql(sql: SqlBuilder): void {
    const operator = Operator[this.operator];
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

export class Exists implements Expression {
  constructor(readonly selectQuery: SelectQuery) {}

  buildSql(sql: SqlBuilder): void {
    sql.append('EXISTS(');
    this.selectQuery.buildSql(sql);
    sql.append(')');
  }
}

export class Union implements Expression {
  readonly queries: SelectQuery[];
  constructor(...queries: SelectQuery[]) {
    this.queries = queries;
  }

  buildSql(sql: SqlBuilder): void {
    for (let i = 0; i < this.queries.length; i++) {
      if (i > 0) {
        sql.append(' UNION ');
      }
      sql.append('(');
      this.queries[i].buildSql(sql);
      sql.append(')');
    }
  }
}

export class Join {
  constructor(
    readonly joinType: 'LEFT JOIN' | 'INNER JOIN',
    readonly joinItem: SelectQuery | string,
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
      this.append(column.columnName);
    } else {
      if (column.tableName) {
        this.appendIdentifier(column.tableName);
        this.append('.');
      }
      this.appendIdentifier(column.columnName);
    }
    if (column.alias) {
      this.append(' AS ');
      this.appendIdentifier(column.alias);
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
        console.log(`result: ${result.rowCount} rows (${duration} ms)`);
      }

      return { rowCount: result.rowCount ?? 0, rows: result.rows };
    } catch (err: any) {
      if (err && typeof err === 'object' && err.code === '23505') {
        // Catch duplicate key errors and throw a 409 Conflict
        // See https://github.com/brianc/node-postgres/issues/1602
        // See https://www.postgresql.org/docs/10/errcodes-appendix.html
        throw new OperationOutcomeError(conflict(err.detail));
      }
      throw err;
    }
  }
}

export abstract class BaseQuery {
  readonly tableName: string;
  readonly predicate: Conjunction;
  explain = false;
  analyzeBuffers = false;
  readonly alias?: string;

  constructor(tableName: string, alias?: string) {
    this.tableName = tableName;
    this.alias = alias;
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

interface CTE {
  name: string;
  expr: Expression;
  recursive?: boolean;
}

export class SelectQuery extends BaseQuery implements Expression {
  readonly innerQuery?: SelectQuery | Union;
  readonly distinctOns: Column[];
  readonly columns: (Column | Literal)[];
  readonly joins: Join[];
  readonly groupBys: GroupBy[];
  readonly orderBys: OrderBy[];
  with?: CTE;
  limit_: number;
  offset_: number;
  joinCount = 0;

  constructor(tableName: string, innerQuery?: SelectQuery | Union, alias?: string) {
    super(tableName, alias);
    this.innerQuery = innerQuery;
    this.distinctOns = [];
    this.columns = [];
    this.joins = [];
    this.groupBys = [];
    this.orderBys = [];
    this.limit_ = 0;
    this.offset_ = 0;
  }

  withRecursive(name: string, expr: Expression): this {
    this.with = { name, expr: expr, recursive: true };
    return this;
  }

  distinctOn(column: Column | string): this {
    this.distinctOns.push(getColumn(column, this.tableName));
    return this;
  }

  raw(column: string): this {
    this.columns.push(new Column(undefined, column, true));
    return this;
  }

  column(column: Column | string | Literal): this {
    this.columns.push(column instanceof Literal ? column : getColumn(column, this.tableName));
    return this;
  }

  getNextJoinAlias(): string {
    this.joinCount++;
    return `T${this.joinCount}`;
  }

  innerJoin(joinItem: SelectQuery | string, joinAlias: string, onExpression: Expression): this {
    this.joins.push(new Join('INNER JOIN', joinItem, joinAlias, onExpression));
    return this;
  }

  leftJoin(joinItem: SelectQuery | string, joinAlias: string, onExpression: Expression): this {
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
      if (this.analyzeBuffers) {
        sql.append('(ANALYZE, BUFFERS) ');
      }
    }
    if (this.with) {
      sql.append('WITH ');
      if (this.with.recursive) {
        sql.append('RECURSIVE ');
      }
      sql.appendIdentifier(this.with.name);
      sql.append(' AS (');
      this.with.expr.buildSql(sql);
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

  async execute(conn: Pool | PoolClient): Promise<any[]> {
    const sql = new SqlBuilder();
    this.buildSql(sql);
    return (await sql.execute(conn)).rows;
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
      throw new Error('No columns selected');
    }
    let first = true;
    for (const column of this.columns) {
      if (!first) {
        sql.append(', ');
      }
      if (column instanceof Literal) {
        sql.appendParameters(column.value, false);
      } else {
        sql.appendColumn(column);
      }
      first = false;
    }
  }

  private buildFrom(sql: SqlBuilder): void {
    sql.append(' FROM ');

    if (this.innerQuery) {
      sql.append('(');
      this.innerQuery.buildSql(sql);
      sql.append(') AS ');
    }

    sql.appendIdentifier(this.tableName);
    if (this.alias) {
      sql.append(' ');
      sql.appendIdentifier(this.alias);
      sql.append(' ');
    }

    for (const join of this.joins) {
      sql.append(` ${join.joinType} `);
      if (join.joinItem instanceof SelectQuery) {
        sql.append('(');
        join.joinItem.buildSql(sql);
        sql.append(')');
      } else {
        sql.appendIdentifier(join.joinItem);
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
      sql.appendColumn(orderBy.column);
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
  private readonly values?: Record<string, any>[];
  private readonly query?: SelectQuery;
  private returnColumns?: string[];
  private conflictColumns?: string[];
  private ignoreConflict?: boolean;

  constructor(tableName: string, values: Record<string, any>[] | SelectQuery) {
    super(tableName);
    if (Array.isArray(values)) {
      this.values = values;
    } else {
      this.query = values;
    }
  }

  mergeOnConflict(columns?: string[]): this {
    this.conflictColumns = columns ?? ['id'];
    return this;
  }

  ignoreOnConflict(): this {
    this.ignoreConflict = true;
    return this;
  }

  returnColumn(column: Column | string): this {
    this.returnColumns = append(this.returnColumns, column instanceof Column ? column.columnName : column);
    return this;
  }

  async execute(conn: Pool | PoolClient): Promise<{ rowCount: number; rows: any[] }> {
    const sql = new SqlBuilder();
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.tableName);
    if (this.values) {
      const columnNames = Object.keys(this.values[0]);
      this.appendColumns(sql, columnNames);
      this.appendAllValues(sql, columnNames);
    } else {
      this.appendSubquery(sql);
    }
    this.appendMerge(sql);
    if (this.returnColumns) {
      sql.append(` RETURNING (${this.returnColumns.join(', ')})`);
    }
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
    this.query.buildSql(sql);
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

    sql.append(` ON CONFLICT (${this.conflictColumns.map((c) => '"' + c + '"').join(', ')}) DO UPDATE SET `);

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
}

export class DeleteQuery extends BaseQuery {
  returnColumns?: string[];

  returnColumn(column: Column | string): this {
    this.returnColumns = append(this.returnColumns, column instanceof Column ? column.columnName : column);
    return this;
  }
  async execute(conn: Pool | PoolClient): Promise<any[]> {
    const sql = new SqlBuilder();
    sql.append('DELETE FROM ');
    sql.appendIdentifier(this.tableName);
    this.buildConditions(sql);
    if (this.returnColumns) {
      sql.append(` RETURNING (${this.returnColumns.join(', ')})`);
    }
    return (await sql.execute(conn)).rows;
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
