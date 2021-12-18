export interface Token {
  id: string;
  value: string;
}

export function tokenize(str: string): Token[] {
  return new Tokenizer(str).tokenize();
}

const STANDARD_UNITS = [
  'year',
  'years',
  'month',
  'months',
  'week',
  'weeks',
  'day',
  'days',
  'hour',
  'hours',
  'minute',
  'minutes',
  'second',
  'seconds',
  'millisecond',
  'milliseconds',
];

const TWO_CHAR_OPERATORS = ['!=', '!~', '<=', '>=', '{}'];

class Tokenizer {
  private readonly str: string;
  private pos: number;

  constructor(str: string) {
    this.str = str;
    this.pos = 0;
  }

  tokenize(): Token[] {
    const result: Token[] = [];

    while (this.pos < this.str.length) {
      const token = this.consumeToken();
      if (token) {
        result.push(token);
      }
    }

    return result;
  }

  private peekToken(): Token | undefined {
    const start = this.pos;
    const token = this.consumeToken();
    this.pos = start;
    return token;
  }

  private consumeToken(): Token | undefined {
    this.consumeWhitespace();

    const c = this.curr();
    if (!c) {
      return undefined;
    }

    const next = this.peek();

    if (c === '/' && next === '*') {
      return this.consumeMultiLineComment();
    }

    if (c === '/' && next === '/') {
      return this.consumeSingleLineComment();
    }

    if (c === "'") {
      return this.consumeString();
    }

    if (c === '`') {
      return this.consumeBacktickSymbol();
    }

    if (c === '@') {
      return this.consumeDateTime();
    }

    if (c.match(/\d/)) {
      return this.consumeNumber();
    }

    if (c.match(/\w/)) {
      return this.consumeSymbol();
    }

    if (c === '$' && next.match(/\w/)) {
      return this.consumeSymbol();
    }

    return this.consumeOperator();
  }

  private consumeWhitespace(): Token {
    return buildToken(
      'Whitespace',
      this.consumeWhile(() => this.curr().match(/\s/))
    );
  }

  private consumeMultiLineComment(): Token {
    const start = this.pos;
    this.consumeWhile(() => this.curr() !== '*' || this.peek() !== '/');
    this.pos += 2;
    return buildToken('Comment', this.str.substring(start, this.pos));
  }

  private consumeSingleLineComment(): Token {
    return buildToken(
      'Comment',
      this.consumeWhile(() => this.curr() !== '\n')
    );
  }

  private consumeString(): Token {
    this.pos++;
    const result = buildToken(
      'String',
      this.consumeWhile(() => this.prev() === '\\' || this.curr() !== "'")
    );
    this.pos++;
    return result;
  }

  private consumeBacktickSymbol(): Token {
    this.pos++;
    const result = buildToken(
      'Symbol',
      this.consumeWhile(() => this.curr() !== '`')
    );
    this.pos++;
    return result;
  }

  private consumeDateTime(): Token {
    const start = this.pos;
    this.pos++;
    this.consumeWhile(() => this.curr().match(/[\d-]/));

    if (this.curr() === 'T') {
      this.pos++;
      this.consumeWhile(() => this.curr().match(/[\d:]/));

      if (this.curr() === '.' && this.peek().match(/\d/)) {
        this.pos++;
        this.consumeWhile(() => this.curr().match(/[\d]/));
      }

      if (this.curr() === 'Z') {
        this.pos++;
      } else if (this.curr() === '+' || this.curr() === '-') {
        this.pos++;
        this.consumeWhile(() => this.curr().match(/[\d:]/));
      }
    }

    return buildToken('DateTime', this.str.substring(start + 1, this.pos));
  }

  private consumeNumber(): Token {
    const start = this.pos;
    let id = 'Number';

    if (this.curr() === '-') {
      this.pos++;
    }

    this.consumeWhile(() => this.curr().match(/\d/));

    if (this.curr() === '.' && this.peek().match(/\d/)) {
      this.pos++;
      this.consumeWhile(() => this.curr().match(/\d/));
    }

    if (this.curr() === ' ') {
      if (isUnitToken(this.peekToken())) {
        id = 'Quantity';
        this.consumeToken();
      }
    }

    return buildToken(id, this.str.substring(start, this.pos));
  }

  private consumeSymbol(): Token {
    return buildToken(
      'Symbol',
      this.consumeWhile(() => this.curr().match(/[$\w]/))
    );
  }

  private consumeOperator(): Token {
    const c = this.curr();
    const next = this.peek();
    const twoCharOp = c + next;

    if (TWO_CHAR_OPERATORS.includes(twoCharOp)) {
      this.pos += 2;
      return buildToken(twoCharOp, twoCharOp);
    }

    this.pos++;
    return buildToken(c, c);
  }

  private consumeWhile(condition: () => any): string {
    const start = this.pos;

    while (this.pos < this.str.length && condition()) {
      this.pos++;
    }

    return this.str.substring(start, this.pos);
  }

  private curr(): string {
    return this.str[this.pos];
  }

  private prev(): string {
    return this.str[this.pos - 1] ?? '';
  }

  private peek(): string {
    return this.str[this.pos + 1] ?? '';
  }
}

function buildToken(id: string, value: string): Token {
  return { id, value };
}

function isUnitToken(token: Token | undefined): boolean {
  if (token) {
    if (token.id === 'String') {
      return true;
    }

    if (token.id === 'Symbol' && STANDARD_UNITS.includes(token.value)) {
      return true;
    }
  }

  return false;
}
