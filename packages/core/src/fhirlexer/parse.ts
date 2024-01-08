import { TypedValue } from '../types';
import { Token } from './tokenize';

export interface AtomContext {
  parent?: AtomContext;
  variables: Record<string, TypedValue>;
}
export interface Atom {
  eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  toString(): string;
}

export abstract class PrefixOperatorAtom implements Atom {
  constructor(
    public readonly operator: string,
    public readonly child: Atom
  ) {}

  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  toString(): string {
    return `${this.operator}(${this.child.toString()})`;
  }
}

export abstract class InfixOperatorAtom implements Atom {
  constructor(
    public readonly operator: string,
    public readonly left: Atom,
    public readonly right: Atom
  ) {}

  abstract eval(context: AtomContext, input: TypedValue[]): TypedValue[];

  toString(): string {
    return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
  }
}

export interface PrefixParselet {
  parse(parser: Parser, token: Token): Atom;
}

export interface InfixParselet {
  precedence: number;
  parse?(parser: Parser, left: Atom, token: Token): Atom;
}

export class ParserBuilder {
  private readonly prefixParselets: Record<string, PrefixParselet> = {};
  private readonly infixParselets: Record<string, InfixParselet> = {};

  public registerInfix(tokenType: string, parselet: InfixParselet): this {
    this.infixParselets[tokenType] = parselet;
    return this;
  }

  public registerPrefix(tokenType: string, parselet: PrefixParselet): this {
    this.prefixParselets[tokenType] = parselet;
    return this;
  }

  public prefix(tokenType: string, precedence: number, builder: (token: Token, right: Atom) => Atom): this {
    return this.registerPrefix(tokenType, {
      parse(parser, token) {
        const right = parser.consumeAndParse(precedence);
        return builder(token, right);
      },
    });
  }

  public infixLeft(
    tokenType: string,
    precedence: number,
    builder: (left: Atom, token: Token, right: Atom) => Atom
  ): this {
    return this.registerInfix(tokenType, {
      parse(parser, left, token) {
        const right = parser.consumeAndParse(precedence);
        return builder(left, token, right);
      },
      precedence,
    });
  }

  public construct(input: Token[]): Parser {
    return new Parser(input, this.prefixParselets, this.infixParselets);
  }
}

export class Parser {
  private tokens: Token[];
  private prefixParselets: Record<string, PrefixParselet>;
  private infixParselets: Record<string, InfixParselet>;

  constructor(
    tokens: Token[],
    prefixParselets: Record<string, PrefixParselet>,
    infixParselets: Record<string, InfixParselet>
  ) {
    this.tokens = tokens;
    this.prefixParselets = prefixParselets;
    this.infixParselets = infixParselets;
  }

  hasMore(): boolean {
    return this.tokens.length > 0;
  }

  match(expected: string): boolean {
    const token = this.peek();
    if (token?.id !== expected) {
      return false;
    }

    this.consume();
    return true;
  }

  consumeAndParse(precedence = Infinity): Atom {
    const token = this.consume();
    const prefix = this.prefixParselets[token.id];
    if (!prefix) {
      throw Error(
        `Parse error at "${token.value}" (line ${token.line}, column ${token.column}). No matching prefix parselet.`
      );
    }

    let left = prefix.parse(this, token);

    while (precedence > this.getPrecedence()) {
      const next = this.consume();
      const infix = this.getInfixParselet(next) as InfixParselet;
      left = (infix.parse as (parser: Parser, left: Atom, token: Token) => Atom)(this, left, next);
    }

    return left;
  }

  getPrecedence(): number {
    const nextToken = this.peek();
    if (!nextToken) {
      return Infinity;
    }
    const parser = this.getInfixParselet(nextToken);
    if (parser) {
      return parser.precedence;
    }
    return Infinity;
  }

  consume(expectedId?: string, expectedValue?: string): Token {
    if (!this.tokens.length) {
      throw Error('Cant consume unknown more tokens.');
    }
    if (expectedId && this.peek()?.id !== expectedId) {
      const actual = this.peek() as Token;
      throw Error(
        `Expected ${expectedId} but got "${actual.id}" (${actual.value}) at line ${actual.line} column ${actual.column}.`
      );
    }
    if (expectedValue && this.peek()?.value !== expectedValue) {
      const actual = this.peek() as Token;
      throw Error(
        `Expected "${expectedValue}" but got "${actual.value}" at line ${actual.line} column ${actual.column}.`
      );
    }
    return this.tokens.shift() as Token;
  }

  peek(): Token | undefined {
    return this.tokens.length > 0 ? this.tokens[0] : undefined;
  }

  removeComments(): void {
    this.tokens = this.tokens.filter((t) => t.id !== 'Comment');
  }

  getInfixParselet(token: Token): InfixParselet | undefined {
    return this.infixParselets[token.id === 'Symbol' ? token.value : token.id];
  }
}
