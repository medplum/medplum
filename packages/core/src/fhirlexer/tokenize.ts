export interface Marker {
  index: number;
  line: number;
  column: number;
}

export interface Token extends Marker {
  id: string;
  value: string;
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

export interface TokenizerOptions {
  dateTimeLiterals?: boolean;
  symbolRegex?: RegExp;
}

export class Tokenizer {
  private readonly str: string;
  private readonly keywords: string[];
  private readonly operators: string[];
  private readonly dateTimeLiterals: boolean;
  private readonly symbolRegex: RegExp;
  private readonly result: Token[] = [];
  private readonly pos: Marker = { index: 0, line: 1, column: 0 };
  private readonly markStack: Marker[] = [];

  constructor(str: string, keywords: string[], operators: string[], options?: TokenizerOptions) {
    this.str = str;
    this.keywords = keywords;
    this.operators = operators;
    this.dateTimeLiterals = !!options?.dateTimeLiterals;
    this.symbolRegex = options?.symbolRegex ?? /[$\w]/;
  }

  tokenize(): Token[] {
    while (this.pos.index < this.str.length) {
      const token = this.consumeToken();
      if (token) {
        this.result.push(token);
      }
    }

    return this.result;
  }

  private prevToken(): Token | undefined {
    return this.result.slice(-1)[0];
  }

  private peekToken(): Token | undefined {
    this.mark();
    const token = this.consumeToken();
    this.reset();
    return token;
  }

  private consumeToken(): Token | undefined {
    this.consumeWhitespace();

    const c = this.curr();
    if (!c) {
      return undefined;
    }

    this.mark();

    const next = this.peek();

    if (c === '/' && next === '*') {
      return this.consumeMultiLineComment();
    }

    if (c === '/' && next === '/') {
      return this.consumeSingleLineComment();
    }

    if (c === "'" || c === '"') {
      return this.consumeString(c);
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

  private consumeWhitespace(): void {
    this.consumeWhile(() => this.curr().match(/\s/));
  }

  private consumeMultiLineComment(): Token {
    const start = this.pos.index;
    this.consumeWhile(() => this.curr() !== '*' || this.peek() !== '/');
    this.advance();
    this.advance();
    return this.buildToken('Comment', this.str.substring(start, this.pos.index));
  }

  private consumeSingleLineComment(): Token {
    return this.buildToken(
      'Comment',
      this.consumeWhile(() => this.curr() !== '\n')
    );
  }

  private consumeString(endChar: string): Token {
    this.advance();
    const result = this.buildToken(
      'String',
      this.consumeWhile(() => this.prev() === '\\' || this.curr() !== endChar)
    );
    this.advance();
    return result;
  }

  private consumeBacktickSymbol(): Token {
    this.advance();
    const result = this.buildToken(
      'Symbol',
      this.consumeWhile(() => this.curr() !== '`')
    );
    this.advance();
    return result;
  }

  private consumeDateTime(): Token {
    this.advance(); // Consume "@"

    const start = this.pos.index;
    this.consumeWhile(() => this.curr().match(/[\d-]/));

    if (this.curr() === 'T') {
      this.advance();
      this.consumeWhile(() => this.curr().match(/[\d:]/));

      if (this.curr() === '.' && this.peek().match(/\d/)) {
        this.advance();
        this.consumeWhile(() => this.curr().match(/\d/));
      }

      if (this.curr() === 'Z') {
        this.advance();
      } else if (this.curr() === '+' || this.curr() === '-') {
        this.advance();
        this.consumeWhile(() => this.curr().match(/[\d:]/));
      }
    }

    return this.buildToken('DateTime', this.str.substring(start, this.pos.index));
  }

  private consumeNumber(): Token {
    const start = this.pos.index;
    let id = 'Number';
    this.consumeWhile(() => this.curr().match(/\d/));

    if (this.curr() === '.' && this.peek().match(/\d/)) {
      this.advance();
      this.consumeWhile(() => this.curr().match(/\d/));
    }

    if (this.curr() === '-' && this.dateTimeLiterals) {
      // Rewind to one character before the start, and then treat as dateTime literal.
      this.pos.index = start - 1;
      return this.consumeDateTime();
    }

    if (this.curr() === ' ') {
      if (isUnitToken(this.peekToken())) {
        id = 'Quantity';
        this.consumeToken();
      }
    }

    return this.buildToken(id, this.str.substring(start, this.pos.index));
  }

  private consumeSymbol(): Token {
    const value = this.consumeWhile(() => this.curr().match(this.symbolRegex));
    if (this.prevToken()?.value !== '.' && this.keywords.includes(value)) {
      return this.buildToken(value, value);
    }
    return this.buildToken('Symbol', value);
  }

  private consumeOperator(): Token {
    const c = this.curr();
    const next = this.peek();
    const twoCharOp = c + next;

    if (this.operators.includes(twoCharOp)) {
      this.advance();
      this.advance();
      return this.buildToken(twoCharOp, twoCharOp);
    }

    this.advance();
    return this.buildToken(c, c);
  }

  private consumeWhile(condition: () => unknown): string {
    const start = this.pos.index;

    while (this.pos.index < this.str.length && condition()) {
      this.advance();
    }

    return this.str.substring(start, this.pos.index);
  }

  private curr(): string {
    return this.str[this.pos.index];
  }

  private prev(): string {
    return this.str[this.pos.index - 1] ?? '';
  }

  private peek(): string {
    return this.str[this.pos.index + 1] ?? '';
  }

  private mark(): void {
    this.markStack.push({ ...this.pos });
  }

  private reset(): void {
    const mark = this.markStack.pop();
    if (!mark) {
      throw new Error('No mark to reset to');
    }
    this.pos.index = mark.index;
    this.pos.line = mark.line;
    this.pos.column = mark.column;
  }

  private advance(): void {
    this.pos.index++;
    if (this.curr() === '\n') {
      this.pos.line++;
      this.pos.column = 0;
    } else {
      this.pos.column++;
    }
  }

  private buildToken(id: string, value: string): Token {
    const mark = this.markStack.pop();
    if (!mark) {
      throw new Error('No mark for token');
    }
    return {
      id,
      value,
      ...mark,
    };
  }
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
