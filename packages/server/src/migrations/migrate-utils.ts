// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { QueryResult } from 'pg';
import type { SqlFunctionDefinition } from '../fhir/sql';
import type { ColumnDefinition, DbClient, IndexDefinition, IndexType } from './types';
import { IndexTypes } from './types';

export const TableNameAbbreviations: Record<string, string | undefined> = {
  MedicinalProductAuthorization: 'MPA',
  MedicinalProductContraindication: 'MPC',
  MedicinalProductPharmaceutical: 'MPP',
  MedicinalProductUndesirableEffect: 'MPUE',
};

export const ColumnNameAbbreviations: Record<string, string | undefined> = {
  participatingOrganization: 'partOrg',
  primaryOrganization: 'primOrg',
  immunizationEvent: 'immEvent',
  identifier: 'idnt',
  Identifier: 'Idnt',
};

/**
 * When comparing introspective SQL statements, column names are often only wrapped in double quotes when they are mixed case.
 * @param name - a column name
 * @returns The name, possibly wrapped in double quotes if it is mixed case
 */
export function escapeMixedCaseIdentifier(name: string): string {
  return name === name.toLocaleLowerCase() ? name : '"' + name + '"';
}

/**
 * When writing SQL statements to a file, adds an escaped backslash, i.e. \\, before single quotes in the expression.
 *
 * @example doubleEscapeSingleQuotes("to_tsvector('simple'::regconfig, value)") => "to_tsvector(\\'simple\\'::regconfig, value)"
 *
 * @param expression - A SQL expression that may include single quotes
 * @returns The expression with single quotes escaped
 */
export function doubleEscapeSingleQuotes(expression: string): string {
  return expression.replaceAll("'", String.raw`\'`);
}

/**
 * Generate a SQL expression that converts a column to a tsvector using the specified configuration.
 * @param config - the configuration to use
 * @param column - the column to convert
 * @returns The SQL expression
 */
export function tsVectorExpression(config: 'simple' | 'english', column: string): string {
  return `to_tsvector('${config}'::regconfig, ${escapeMixedCaseIdentifier(column)})`;
}

/**
 * Splits a string on leading single underscores.
 * e.g. 'col1__col2___col3' => ['col1', '_col2', '__col3']
 * @param indexColumnNames - The string to split
 * @returns The split string
 */
export function splitIndexColumnNames(indexColumnNames: string): string[] {
  const parts = indexColumnNames.split('_');
  let i = parts.length - 1;
  while (i >= 0) {
    const part = parts[i];
    if (part === '') {
      parts[i + 1] = '_' + parts[i + 1];
      parts.splice(i, 1);
      i++;
    }
    i--;
  }
  return parts;
}

type Token = {
  type: 'COMMA' | 'LPAREN' | 'RPAREN' | 'TEXT';
  value: string;
};

function tokenizeIndexExpression(input: string): Token[] {
  const tokens: Token[] = [];
  let current = 0;
  let text = '';

  function pushText(): void {
    if (text) {
      tokens.push({ type: 'TEXT', value: text });
    }
    text = '';
  }

  while (current < input.length) {
    const char = input[current];

    if (char === '(') {
      pushText();
      tokens.push({ type: 'LPAREN', value: '(' });
      current++;
    } else if (char === ')') {
      pushText();
      tokens.push({ type: 'RPAREN', value: ')' });
      current++;
    } else if (char === ',') {
      pushText();
      tokens.push({ type: 'COMMA', value: ',' });
      current++;
    } else {
      text += char;
      current++;
    }
  }

  pushText();
  return tokens;
}

// Parse the tokens into columns
function parseIndexExpression(tokens: Token[]): string[] {
  const columns: string[] = [];
  let currentColumn = '';
  let parenCount = 0;

  for (const token of tokens) {
    switch (token.type) {
      case 'LPAREN':
        parenCount++;
        currentColumn += token.value;
        break;
      case 'RPAREN':
        parenCount--;
        currentColumn += token.value;
        break;
      case 'COMMA':
        if (parenCount === 0) {
          columns.push(currentColumn);
          currentColumn = '';
        } else {
          currentColumn += token.value;
        }
        break;
      case 'TEXT':
        currentColumn += token.value;
        break;
    }
  }

  if (currentColumn) {
    columns.push(currentColumn.trim());
  }

  return columns;
}

export function parseIndexColumns(expression: string): string[] {
  return parseIndexExpression(tokenizeIndexExpression(expression));
}

/**
 * Converts Unicode characters to their escaped representation
 * - ASCII control chars (0x00-0x1F) and DEL (0x7F) use \x format
 * - Other Unicode chars use \u format
 * @param str - Input string
 * @returns Escaped string
 */
export function escapeUnicode(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replaceAll(/[\x01-\x1F\x7F-\uFFFF]/g, (char) => {
    const code = char.codePointAt(0);
    if (code === undefined) {
      return char;
    }

    // tab, carriage return, line feed are okay
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      return char;
    }

    // For ASCII control characters (0x00-0x1F) and DEL (0x7F), use \x format
    if (code < 0x20 || code === 0x7f) {
      return String.raw`\x${code.toString(16).padStart(2, '0')}`;
    }

    // For other Unicode characters, use \u format
    return String.raw`\u${code.toString(16).padStart(4, '0')}`;
  });
}

export function normalizeColumnType(colType: string): string {
  return colType.toLocaleUpperCase().replace('TIMESTAMP WITH TIME ZONE', 'TIMESTAMPTZ').trim();
}

export async function getColumns(
  db: DbClient,
  tableName: string
): Promise<(ColumnDefinition & { primaryKey: boolean; notNull: boolean })[]> {
  // https://stackoverflow.com/questions/8146448/get-the-default-values-of-table-columns-in-postgres
  const rs = await db.query(
    `
    SELECT
      attname,
      attnotnull,
      format_type(atttypid, atttypmod) AS data_type,
      COALESCE((SELECT indisprimary from pg_index where indrelid = attrelid AND attnum = any(indkey) and indisprimary = true), FALSE) AS primary_key,
      pg_get_expr(d.adbin, d.adrelid) AS default_value
    FROM
      pg_attribute
      JOIN pg_class ON pg_class.oid = attrelid
      JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef d ON (pg_attribute.attrelid, pg_attribute.attnum) = (d.adrelid, d.adnum)
    WHERE
      pg_namespace.nspname = 'public'
      AND pg_class.relname = $1
      AND attnum > 0
      AND NOT attisdropped
    ORDER BY
      attnum
  `,
    [tableName]
  );

  return rs.rows.map((row) => ({
    name: row.attname,
    type: normalizeColumnType(row.data_type.toUpperCase()),
    primaryKey: Boolean(row.primary_key),
    notNull: row.attnotnull,
    defaultValue: row.default_value,
  }));
}

export async function getFunctionDefinition(db: DbClient, name: string): Promise<SqlFunctionDefinition | undefined> {
  let result: QueryResult<{ pg_get_functiondef: string }>;
  try {
    result = await db.query(`SELECT pg_catalog.pg_get_functiondef($1::regproc::oid);`, [name]);
  } catch (err) {
    if (err instanceof Error && err.message.includes('does not exist')) {
      return undefined;
    }
    throw err;
  }

  return {
    name,
    createQuery: result.rows[0].pg_get_functiondef,
  };
}

export function parseIndexDefinition(indexdef: string): IndexDefinition {
  const fullIndexDef = indexdef;

  let where: string | undefined;
  const whereMatch = / WHERE \((.+)\)$/.exec(indexdef);
  if (whereMatch) {
    where = whereMatch[1];
    indexdef = indexdef.substring(0, whereMatch.index);
  }

  // parse but ignore WITH clause since we don't want to consider any index settings in the official schema
  const withMatch = / WITH \((.+)\)$/.exec(indexdef);
  if (withMatch) {
    indexdef = indexdef.substring(0, withMatch.index);
  }

  let include: string[] | undefined;
  const includeMatch = / INCLUDE \((.+)\)$/.exec(indexdef);
  if (includeMatch) {
    include = includeMatch[1].split(',').map((s) => s.trim().replaceAll('"', ''));
    indexdef = indexdef.substring(0, includeMatch.index);
  }

  const typeAndExpressionsMatch = /USING (\w+) \((.+)\)$/.exec(indexdef);
  if (!typeAndExpressionsMatch) {
    throw new Error('Could not parse index type and expressions from ' + indexdef);
  }

  const indexType = typeAndExpressionsMatch[1] as IndexType;
  if (!IndexTypes.includes(indexType)) {
    throw new Error('Invalid index type: ' + indexType);
  }

  const expressionString = typeAndExpressionsMatch[2];
  const parsedExpressions = parseIndexColumns(expressionString);
  const columns = parsedExpressions.map<IndexDefinition['columns'][number]>((expression, i) => {
    if (expression.match(/^[ \w"]+$/)) {
      return expression.trim().replaceAll('"', '');
    }

    const idxNameMatch = /INDEX "([a-zA-Z]+)_(\w+)_(idx|idx_tsv)" ON/.exec(indexdef); // ResourceName_column1_column2_idx
    if (!idxNameMatch) {
      throw new Error('Could not parse index name from ' + indexdef);
    }

    let name = splitIndexColumnNames(idxNameMatch[2])[i];
    if (!name) {
      // column names aren't considered when determining index equality, so it is fine to use a placeholder
      // name here. If we want to be stricter and match on index name as well, throw an error here instead
      // of using a placeholder name among other changes
      name = 'placeholder';
    }
    name = expandAbbreviations(name, ColumnNameAbbreviations);

    return { expression, name };
  });

  const indexDef: IndexDefinition = {
    columns,
    indexType: indexType,
    unique: indexdef.includes('CREATE UNIQUE INDEX'),
    indexdef: fullIndexDef,
  };

  if (where) {
    indexDef.where = where;
  }

  if (include) {
    indexDef.include = include;
  }

  return indexDef;
}

function expandAbbreviations(name: string, abbreviations: Record<string, string | undefined>): string {
  let result = name;
  for (const [original, abbrev] of Object.entries(abbreviations as Record<string, string>).reverse()) {
    result = result.replace(abbrev, original);
  }

  // Expand _Refs suffix back to _References
  if (result.endsWith('_Refs')) {
    result = result.slice(0, -'Refs'.length) + 'References';
  }

  return result;
}
