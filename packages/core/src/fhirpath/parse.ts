import { Token, tokenizer } from './tokenize';

export interface Atom {
  eval(context: any): any;
}

interface PrefixParselet {
  parse(parser: Parser, token: Token): Atom;
}

interface InfixParselet {
  precedence: number;
  parse(parser: Parser, left: Atom, token: Token): Atom;
}

class ParserBuilder {
  private readonly prefixParselets: Record<string, PrefixParselet> = {};
  private readonly infixParselets: Record<string, InfixParselet> = {};

  public registerInfix(tokenType: string, parselet: InfixParselet): ParserBuilder {
    this.infixParselets[tokenType] = parselet;
    return this;
  }

  public registerPrefix(tokenType: string, parselet: PrefixParselet): ParserBuilder {
    this.prefixParselets[tokenType] = parselet;
    return this;
  }

  public prefix(tokenType: string, precedence: number, builder: (token: Token, right: Atom) => Atom): ParserBuilder {
    return this.registerPrefix(tokenType, {
      parse(parser, token) {
        const right = parser.parse(precedence)
        return builder(token, right)
      },
    });
  }

  public infixLeft(tokenType: string, precedence: number, builder: (left: Atom, token: Token, right: Atom) => Atom): ParserBuilder {
    return this.registerInfix(tokenType, {
      parse(parser, left, token) {
        const right = parser.parse(precedence)
        return builder(left, token, right)
      },
      precedence
    });
  }

  public infixRight(tokenType: string, precedence: number, builder: (left: Atom, token: Token, right: Atom) => Atom): ParserBuilder {
    return this.registerInfix(tokenType, {
      parse(parser, left, token) {
        const right = parser.parse(precedence - 1)
        return builder(left, token, right)
      },
      precedence
    });
  }

  public construct(input: string): Parser {
    return new Parser(tokenizer.tokenize(input), this.prefixParselets, this.infixParselets);
  }
}

class Parser {
  constructor(
    private tokens: Token[],
    private prefixParselets: Record<string, PrefixParselet>,
    private infixParselets: Record<string, InfixParselet>,
  ) { }

  public match(expected: string): boolean {
    const token = this.look();
    if (token?.id !== expected) {
      return false;
    }

    this.consume();
    return true;
  }

  public parse(precedence = 0): Atom {
    const token = this.consume();
    const prefix = this.prefixParselets[token.id];
    if (!prefix) {
      throw Error(`Parse error at ${token.value}. No matching prefix parselet.`)
    }

    let left = prefix.parse(this, token);

    while (precedence < this.getPrecedence()) {
      const next = this.consume();
      const infix = this.infixParselets[next.id];
      left = infix.parse(this, left, next);
    }

    return left;
  }

  private getPrecedence(): number {
    const nextToken = this.look();
    if (!nextToken) {
      return 0;
    }
    const parser = this.infixParselets[nextToken.id];
    if (parser) {
      return parser.precedence;
    }
    return 0;
  }

  private consume(): Token {
    if (!this.tokens.length) {
      throw Error('Cant consume any more tokens.');
    }
    return this.tokens.shift() as Token;
  }

  private look(): Token | undefined {
    return this.tokens.length > 0 ? this.tokens[0] : undefined;
  }
}

const enum Precedence {
  Union = 1,
  Equals = 2,
  AddSub = 3,
  MulDiv = 4,
  Exp = 5,
  Negate = 6,
  Dot = 7,
  FunctionCall = 8
}

function applyMaybeArray(context: any, fn: (context: any) => any): any {
  if (context === undefined) {
    return undefined;
  }
  if (Array.isArray(context)) {
    return context.map(e => fn(e)).filter(e => !!e).flat();
  } else {
    return fn(context);
  }
}

export class FhirPathAtom implements Atom {
  constructor(
    public readonly original: string,
    public readonly child: Atom) { }

  eval(context: any): any[] {
    try {
      const result = applyMaybeArray(context, e => this.child.eval(e));
      if (Array.isArray(result)) {
        return result.flat();
      } else if (result === undefined || result === null) {
        return [];
      } else {
        return [result];
      }
    } catch (error) {
      throw new Error(`FhirPathError on "${this.original}": ${error}`);
    }
  }
}

class LiteralAtom implements Atom {
  constructor(public readonly value: any) { }
  eval(): any {
    return this.value;
  }
}

class SymbolAtom implements Atom {
  constructor(public readonly name: string) { }
  eval(context: any): any {
    return applyMaybeArray(context, e => e.resourceType === this.name ? e : e[this.name]);
  }
}

class UnaryOperatorAtom implements Atom {
  constructor(
    public readonly child: Atom,
    public readonly impl: (x: any) => any) { }

  eval(context: any): any {
    return this.impl(this.child.eval(context));
  }
}

class BinaryOperatorAtom implements Atom {
  constructor(
    public readonly left: Atom,
    public readonly right: Atom,
    public readonly impl: (x: any, y: any) => any) { }

  eval(context: any): any {
    return this.impl(this.left.eval(context), this.right.eval(context));
  }
}

class DotAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) { }
  eval(context: any): Atom {
    return this.right.eval(this.left.eval(context));
  }
}

class UnionAtom implements Atom {
  constructor(public readonly left: Atom, public readonly right: Atom) { }
  eval(context: any): any {
    const leftResult = this.left.eval(context);
    const rightResult = this.right.eval(context);
    if (leftResult && rightResult) {
      return [leftResult, rightResult].flat();
    }
    return leftResult || rightResult;
  }
}

class FunctionAtom implements Atom {
  constructor(
    public readonly name: string,
    public readonly args: Atom[],
    public readonly impl: (context: any, ...a: Atom[]) => any
  ) { }
  eval(context: any): any {
    return this.impl(context, ...this.args);
  }
}

const functions: Record<string, (context: any, ...args: Atom[]) => any> = {
  where(context: any, condition: Atom): any {
    return applyMaybeArray(context, e => condition.eval(e) ? e : undefined);
  },

  resolve(context: any): any {
    // If context is a reference, turn it into a resource
    // Otherwise return undefined
    const refStr = context.reference;
    if (!refStr) {
      return undefined;
    }
    const [resourceType, id] = refStr.split('/');
    return { resourceType, id };
  },

  as(context: any, expression: Atom): any {
    return context;
  },

  exists(context: any): boolean {
    return context !== undefined && (Array.isArray(context) && context.length > 0) || (!!context);
  }
};

const PARENTHESES_PARSELET: PrefixParselet = {
  parse(parser: Parser) {
    const expr = parser.parse();
    if (!parser.match(')')) {
      throw new Error('Parse error: expected `)`');
    }
    return expr;
  }
};

const FUNCTION_CALL_PARSELET: InfixParselet = {
  parse(parser: Parser, left: Atom) {
    if (!(left instanceof SymbolAtom)) {
      throw new Error('Unexpected parentheses');
    }

    if (!(left.name in functions)) {
      throw new Error('Unrecognized function: ' + left.name);
    }

    const args = [];
    while (!parser.match(')')) {
      args.push(parser.parse());
    }

    return new FunctionAtom(left.name, args, functions[left.name]);
  },
  precedence: Precedence.FunctionCall
};

const parserBuilder = new ParserBuilder()
  .registerPrefix('StringLiteral', { parse: (_, token) => new LiteralAtom(token.value.substring(1, token.value.length - 1)) })
  .registerPrefix('Number', { parse: (_, token) => new LiteralAtom(parseFloat(token.value)) })
  .registerPrefix('Symbol', { parse: (_, token) => new SymbolAtom(token.value) })
  .registerPrefix('(', PARENTHESES_PARSELET)
  .registerInfix('(', FUNCTION_CALL_PARSELET)
  .prefix('-', Precedence.Negate, (_, right) => new UnaryOperatorAtom(right, x => -x))
  .infixLeft('.', Precedence.Dot, (left, _, right) => new DotAtom(left, right))
  .infixRight('^', Precedence.Exp, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x ** y))
  .infixLeft('/', Precedence.MulDiv, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x / y))
  .infixLeft('*', Precedence.MulDiv, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x * y))
  .infixLeft('+', Precedence.AddSub, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x + y))
  .infixLeft('-', Precedence.AddSub, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x - y))
  .infixLeft('|', Precedence.Union, (left, _, right) => new UnionAtom(left, right))
  .infixLeft('=', Precedence.Equals, (left, _, right) => new BinaryOperatorAtom(left, right, (x, y) => x === y))
  .infixLeft('Symbol', Precedence.Union, (left: Atom, symbol: Token, right: Atom) => {
    switch (symbol.value) {
      case 'as':
        return new BinaryOperatorAtom(left, right, (x, y) => x);
      case 'is':
        return new BinaryOperatorAtom(left, right, (x, y) => true);
      case 'and':
        return new BinaryOperatorAtom(left, right, (x, y) => x && y);
      default:
        throw new Error('Cannot use ' + symbol.value + ' as infix operator');
    }
  });

export function parseFhirPath(input: string): Atom {
  try {
    return new FhirPathAtom(input, parserBuilder.construct(input).parse());
  } catch (error) {
    throw new Error(`FhirPathError on "${input}": ${error}`);
  }
}
