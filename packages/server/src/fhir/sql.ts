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

export interface Column {
  readonly tableName?: string;
  readonly columnName: string;
  readonly raw?: boolean;
}

export interface Condition {
  readonly column: Column;
  readonly operator: Operator;
  readonly parameter: any;
  readonly parameterType?: string;
}

export interface Join {
  readonly left: Column;
  readonly right: Column;
}

export interface OrderBy {
  readonly column: Column;
  readonly descending?: boolean;
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
    this.values.push(value);
    this.sql.push('$' + this.values.length);
    return this;
  }

  async execute(conn: Client | Pool): Promise<any[]> {
    const sql = this.sql.join('');
    if (DEBUG) {
      console.log('sql', sql);
      console.log('values', this.values);
    }
    const result = await conn.query(sql, this.values);
    return result.rows;
  }
}

export abstract class BaseQuery {
  readonly tableName: string;
  readonly conditions: Condition[];

  constructor(tableName: string) {
    this.tableName = tableName;
    this.conditions = [];
  }

  where(column: Column | string, operator: Operator, value: any, type?: string): this {
    this.conditions.push({
      column: getColumn(column),
      operator,
      parameter: value,
      parameterType: type,
    });
    return this;
  }

  protected buildConditions(sql: SqlBuilder): void {
    let first = true;
    for (const condition of this.conditions) {
      sql.append(first ? ' WHERE ' : ' AND ');
      this.buildCondition(sql, condition);
      first = false;
    }
  }

  protected buildCondition(sql: SqlBuilder, condition: Condition): void {
    if (condition.operator === Operator.ARRAY_CONTAINS) {
      if (Array.isArray(condition.parameter)) {
        this.buildArrayContainsArray(sql, condition);
      } else {
        this.buildArrayContainsValue(sql, condition);
      }
    } else {
      this.buildSimpleCondition(sql, condition);
    }
  }

  protected buildArrayContainsArray(sql: SqlBuilder, condition: Condition): void {
    sql.appendColumn(condition.column);
    sql.append('&&ARRAY[');

    let first = true;
    for (const value of condition.parameter) {
      if (!first) {
        sql.append(',');
      }
      sql.param(value);
      first = false;
    }

    sql.append(']');
    if (condition.parameterType) {
      sql.append('::' + condition.parameterType);
    }
  }

  protected buildArrayContainsValue(sql: SqlBuilder, condition: Condition): void {
    sql.param(condition.parameter);
    sql.append('=ANY(');
    sql.appendColumn(condition.column);
    sql.append(')');
  }

  protected buildSimpleCondition(sql: SqlBuilder, condition: Condition): void {
    if (condition.operator === Operator.LIKE || condition.operator === Operator.NOT_LIKE) {
      sql.append('LOWER(');
      sql.appendColumn(condition.column);
      sql.append(')');
      sql.append(condition.operator);
      sql.param((condition.parameter as string).toLowerCase());
    } else {
      sql.appendColumn(condition.column);
      sql.append(condition.operator);
      sql.param(condition.parameter);
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
    this.columns.push({ columnName: column, raw: true });
    return this;
  }

  column(column: Column | string): this {
    this.columns.push(getColumn(column));
    return this;
  }

  join(rightTableName: string, leftColumnName: string, rightColumnName: string): this {
    this.joins.push({
      left: { tableName: this.tableName, columnName: leftColumnName },
      right: { tableName: rightTableName, columnName: rightColumnName },
    });
    return this;
  }

  orderBy(column: Column | string, descending?: boolean): this {
    this.orderBys.push({ column: getColumn(column), descending });
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

  async execute(conn: Pool): Promise<any[]> {
    const sql = new SqlBuilder();
    this.buildSelect(sql);
    this.buildFrom(sql);
    this.buildConditions(sql);
    this.buildOrderBy(sql);

    if (this.limit_ > 0) {
      sql.append(' LIMIT ');
      sql.append(this.limit_);
    }

    if (this.offset_ > 0) {
      sql.append(' OFFSET ');
      sql.append(this.offset_);
    }

    return sql.execute(conn);
  }

  private buildSelect(sql: SqlBuilder): void {
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

  private buildFrom(sql: SqlBuilder): void {
    sql.append(' FROM ');
    sql.appendIdentifier(this.tableName);

    for (const join of this.joins) {
      sql.append(' JOIN ');
      sql.appendIdentifier(join.right.tableName as string);
      sql.append(' ON ');
      sql.appendColumn(join.left);
      sql.append('=');
      sql.appendColumn(join.right);
    }
  }

  private buildOrderBy(sql: SqlBuilder): void {
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
  private readonly values: Record<string, any>;
  private merge?: boolean;

  constructor(tableName: string, values: Record<string, any>) {
    super(tableName);
    this.values = values;
  }

  mergeOnConflict(merge: boolean): this {
    this.merge = merge;
    return this;
  }

  async execute(conn: Pool): Promise<any[]> {
    const sql = new SqlBuilder();
    sql.append('INSERT INTO ');
    sql.appendIdentifier(this.tableName);
    sql.append(' (');

    const entries = Object.entries(this.values);

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

    if (this.merge) {
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
    return { columnName: column };
  } else {
    return column;
  }
}
