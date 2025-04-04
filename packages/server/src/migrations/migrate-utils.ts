/**
 * When comparing introspective SQL statements, column names are often only wrapped in double quotes when they are mixed case.
 * @param name - a column name
 * @returns The name, possibly wrapped in double quotes if it is mixed case
 */
export function quotedColumnName(name: string): string {
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
  return expression.replace(/'/g, "\\'");
}

/**
 * Generate a SQL expression that converts a column to a tsvector using the specified configuration.
 * @param config - the configuration to use
 * @param column - the column to convert
 * @returns The SQL expression
 */
export function tsVectorExpression(config: 'simple' | 'english', column: string): string {
  return `to_tsvector('${config}'::regconfig, ${quotedColumnName(column)})`;
}

/**
 * Splits a string on leading single underscores.
 * e.g. 'col1__col2___col3' => ['col1', '_col2', '__col3']
 * @param indexColumnNames - The string to split
 * @returns The split string
 */
export function splitIndexColumnNames(indexColumnNames: string): string[] {
  const parts = indexColumnNames.split('_');
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part === '') {
      parts[i + 1] = '_' + parts[i + 1];
      parts.splice(i, 1);
      i++;
    }
  }
  return parts;
}

type Token = {
  type: 'COMMA' | 'LPAREN' | 'RPAREN' | 'TEXT';
  value: string;
};

export function parseIndexColumns(expression: string): string[] {
  function tokenize(input: string): Token[] {
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
  function parse(tokens: Token[]): string[] {
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

  return parse(tokenize(expression));
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
  return str.replace(/[\x01-\x1F\x7F-\uFFFF]/g, (char) => {
    const code = char.charCodeAt(0);
    // tab, carriage return, line feed are okay
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      return char;
    }

    // For ASCII control characters (0x00-0x1F) and DEL (0x7F), use \x format
    if (code < 0x20 || code === 0x7f) {
      return '\\x' + code.toString(16).padStart(2, '0');
    }

    // For other Unicode characters, use \u format
    return '\\u' + code.toString(16).padStart(4, '0');
  });
}
