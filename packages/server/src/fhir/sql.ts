import { Client, Pool } from 'pg';

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
  ARRAY_CONTAINS = 'ARRAY_CONTAINS',
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

    if (Array.isArray(this.parameter)) {
      let first = true;
      for (const value of this.parameter) {
        if (!first) {
          sql.append(',');
        }
        sql.param(value);
        first = false;
      }
    } else {
      sql.param(this.parameter);
    }

    sql.append(']');
    if (this.parameterType) {
      sql.append('::' + this.parameterType);
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
    } else if (this.operator === Operator.EQUALS && this.parameter === null) {
      sql.appendColumn(this.column);
      sql.append(' IS NULL');
    } else if (this.operator === Operator.NOT_EQUALS && this.parameter === null) {
      sql.appendColumn(this.column);
      sql.append(' IS NOT NULL');
    } else {
      sql.appendColumn(this.column);
      sql.append(this.operator);
      sql.param(this.parameter);
    }
  }
}

export abstract class Connective implements Expression {
  constructor(readonly keyword: string, readonly expressions: Expression[]) {}

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

  whereExpr(expression: Expression): this {
    this.expressions.push(expression);
    return this;
  }

  where(column: Column | string, operator?: Operator, value?: any, type?: string): this {
    return this.whereExpr(new Condition(column, operator as Operator, value, type));
  }
}

export class Disjunction extends Connective {
  constructor(expressions: Expression[]) {
    super(' OR ', expressions);
  }
}

export class Join {
  constructor(readonly left: Column, readonly right: Column, readonly subQuery?: SelectQuery) {}
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
    this.#values.push(value);
    this.#sql.push('$' + this.#values.length);
    return this;
  }

  toString(): string {
    return this.#sql.join('');
  }

  async execute(conn: Client | Pool): Promise<any[]> {
    const sql = this.toString();
    if (DEBUG) {
      console.log('sql', sql);
      console.log('values', this.#values);
    }
    const result = await conn.query(sql, this.#values);
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
    this.predicate.where(column, operator, value, type);
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
  readonly columns: Column[];
  readonly joins: Join[];
  readonly orderBys: OrderBy[];
  limit_: number;
  offset_: number;

  constructor(tableName: string) {
    super(tableName);
    this.columns = [];
    this.joins = [];
    this.orderBys = [];
    this.limit_ = 0;
    this.offset_ = 0;
  }

  raw(column: string): this {
    this.columns.push(new Column(undefined, column, true));
    return this;
  }

  column(column: Column | string): this {
    this.columns.push(getColumn(column));
    return this;
  }

  getNextJoinAlias(): string {
    return `T${this.joins.length + 1}`;
  }

  join(rightTableName: string, leftColumnName: string, rightColumnName: string, subQuery?: SelectQuery): this {
    this.joins.push(
      new Join(new Column(this.tableName, leftColumnName), new Column(rightTableName, rightColumnName), subQuery)
    );
    return this;
  }

  orderBy(column: Column | string, descending?: boolean): this {
    this.orderBys.push(new OrderBy(getColumn(column), descending));
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
    this.#buildSelect(sql);
    this.#buildFrom(sql);
    this.buildConditions(sql);
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

  async execute(conn: Pool): Promise<any[]> {
    const sql = new SqlBuilder();
    this.buildSql(sql);
    return sql.execute(conn);
  }

  #buildSelect(sql: SqlBuilder): void {
    sql.append('SELECT ');

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
      if (join.subQuery) {
        sql.append(' ( ');
        join.subQuery.buildSql(sql);
        sql.append(' ) ');
      }
      sql.appendIdentifier(join.right.tableName as string);
      sql.append(' ON ');
      sql.appendColumn(join.left);
      sql.append('=');
      sql.appendColumn(join.right);
    }
  }

  #buildOrderBy(sql: SqlBuilder): void {
    let first = true;

    for (const orderBy of this.orderBys) {
      sql.append(first ? ' ORDER BY ' : ', ');
      sql.appendColumn(orderBy.column);
      sql.append(orderBy.descending ? ' DESC' : ' ASC');
      first = false;
    }
  }
}

export class InsertQuery extends BaseQuery {
  readonly #values: Record<string, any>;
  #merge?: boolean;

  constructor(tableName: string, values: Record<string, any>) {
    super(tableName);
    this.#values = values;
  }

  mergeOnConflict(merge: boolean): this {
    this.#merge = merge;
    return this;
  }

  async execute(conn: Pool): Promise<any[]> {
    const sql = new SqlBuilder();
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.tableName);
    sql.append(' (');

    const entries = Object.entries(this.#values);

    let first = true;
    for (const [columnName] of entries) {
      if (!first) {
        sql.append(', ');
      }
      sql.appendIdentifier(columnName);
      first = false;
    }

    sql.append(') VALUES (');

    for (let i = 0; i < entries.length; i++) {
      if (i > 0) {
        sql.append(', ');
      }
      sql.param(entries[i][1]);
    }

    sql.append(')');

    if (this.#merge) {
      sql.append(' ON CONFLICT ("id") DO UPDATE SET ');

      first = true;
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

    return sql.execute(conn);
  }
}

export class DeleteQuery extends BaseQuery {
  async execute(conn: Pool): Promise<any> {
    const sql = new SqlBuilder();
    sql.append('DELETE FROM ');
    sql.appendIdentifier(this.tableName);
    this.buildConditions(sql);
    return sql.execute(conn);
  }
}

function getColumn(column: Column | string): Column {
  if (typeof column === 'string') {
    return new Column(undefined, column);
  } else {
    return column;
  }
}
