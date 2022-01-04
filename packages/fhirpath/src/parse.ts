import { Quantity } from '@medplum/fhirtypes';
import {
  AndAtom,
  ArithemticOperatorAtom,
  AsAtom,
  Atom,
  ComparisonOperatorAtom,
  ConcatAtom,
  ContainsAtom,
  DotAtom,
  EmptySetAtom,
  EqualsAtom,
  EquivalentAtom,
  FhirPathAtom,
  FunctionAtom,
  InAtom,
  IsAtom,
  LiteralAtom,
  NotEqualsAtom,
  NotEquivalentAtom,
  OrAtom,
  SymbolAtom,
  UnaryOperatorAtom,
  UnionAtom,
  XorAtom,
} from './atoms';
import { parseDateString } from './date';
import * as functions from './functions';
import { Token, tokenize } from './tokenize';

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
        const right = parser.parse(precedence);
        return builder(token, right);
      },
    });
  }

  public infixLeft(
    tokenType: string,
    precedence: number,
    builder: (left: Atom, token: Token, right: Atom) => Atom
  ): ParserBuilder {
    return this.registerInfix(tokenType, {
      parse(parser, left, token) {
        const right = parser.parse(precedence);
        return builder(left, token, right);
      },
      precedence,
    });
  }

  public construct(input: string): Parser {
    return new Parser(tokenize(input), this.prefixParselets, this.infixParselets);
  }
}

class Parser {
  constructor(
    private tokens: Token[],
    private prefixParselets: Record<string, PrefixParselet>,
    private infixParselets: Record<string, InfixParselet>
  ) {}

  public match(expected: string): boolean {
    const token = this.look();
    if (token?.id !== expected) {
      return false;
    }

    this.consume();
    return true;
  }

  public parse(precedence = Precedence.MaximumPrecedence): Atom {
    const token = this.consume();
    const prefix = this.prefixParselets[token.id];
    if (!prefix) {
      throw Error(`Parse error at ${token.value}. No matching prefix parselet.`);
    }

    let left = prefix.parse(this, token);

    while (precedence > this.getPrecedence()) {
      const next = this.consume();
      const infix = this.infixParselets[next.id];
      left = infix.parse(this, left, next);
    }

    return left;
  }

  private getPrecedence(): number {
    const nextToken = this.look();
    if (!nextToken) {
      return Precedence.MaximumPrecedence;
    }
    const parser = this.infixParselets[nextToken.id];
    if (parser) {
      return parser.precedence;
    }
    return Precedence.MaximumPrecedence;
  }

  private consume(): Token {
    if (!this.tokens.length) {
      throw Error('Cant consume unknown more tokens.');
    }
    return this.tokens.shift() as Token;
  }

  private look(): Token | undefined {
    return this.tokens.length > 0 ? this.tokens[0] : undefined;
  }
}

/**
 * Operator precedence
 * See: https://hl7.org/fhirpath/#operator-precedence
 */
const enum Precedence {
  FunctionCall = 0,
  Dot = 1,
  Indexer = 2,
  UnaryAdd = 3,
  UnarySubtract = 3,
  Multiply = 4,
  Divide = 4,
  IntegerDivide = 4,
  Modulo = 4,
  Add = 5,
  Subtract = 5,
  Ampersand = 5,
  Is = 6,
  As = 6,
  Union = 7,
  GreaterThan = 8,
  GreaterThanOrEquals = 8,
  LessThan = 8,
  LessThanOrEquals = 8,
  Equals = 9,
  Equivalent = 9,
  NotEquals = 9,
  NotEquivalent = 9,
  In = 10,
  Contains = 10,
  And = 11,
  Xor = 12,
  Or = 12,
  Implies = 13,
  MaximumPrecedence = 100,
}

const PARENTHESES_PARSELET: PrefixParselet = {
  parse(parser: Parser) {
    const expr = parser.parse();
    if (!parser.match(')')) {
      throw new Error('Parse error: expected `)`');
    }
    return expr;
  },
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
      parser.match(',');
    }

    return new FunctionAtom(
      left.name,
      args,
      (functions as Record<string, (context: unknown[], ...a: Atom[]) => unknown[]>)[left.name]
    );
  },
  precedence: Precedence.FunctionCall,
};

function parseQuantity(str: string): Quantity {
  const parts = str.split(' ');
  const value = parseFloat(parts[0]);
  let unit = parts[1];
  if (unit && unit.startsWith("'") && unit.endsWith("'")) {
    unit = unit.substring(1, unit.length - 1);
  } else {
    unit = '{' + unit + '}';
  }
  return { value, unit };
}

const parserBuilder = new ParserBuilder()
  .registerPrefix('String', {
    parse: (_, token) => new LiteralAtom(token.value),
  })
  .registerPrefix('DateTime', {
    parse: (_, token) => new LiteralAtom(parseDateString(token.value)),
  })
  .registerPrefix('Quantity', {
    parse: (_, token) => new LiteralAtom(parseQuantity(token.value)),
  })
  .registerPrefix('Number', {
    parse: (_, token) => new LiteralAtom(parseFloat(token.value)),
  })
  .registerPrefix('Symbol', {
    parse: (_, token) => {
      if (token.value === 'false') {
        return new LiteralAtom(false);
      }
      if (token.value === 'true') {
        return new LiteralAtom(true);
      }
      return new SymbolAtom(token.value);
    },
  })
  .registerPrefix('{}', { parse: () => new EmptySetAtom() })
  .registerPrefix('(', PARENTHESES_PARSELET)
  .registerInfix('(', FUNCTION_CALL_PARSELET)
  .prefix('+', Precedence.UnaryAdd, (_, right) => new UnaryOperatorAtom(right, (x) => x))
  .prefix('-', Precedence.UnarySubtract, (_, right) => new ArithemticOperatorAtom(right, right, (_, y) => -y))
  .infixLeft('.', Precedence.Dot, (left, _, right) => new DotAtom(left, right))
  .infixLeft('/', Precedence.Divide, (left, _, right) => new ArithemticOperatorAtom(left, right, (x, y) => x / y))
  .infixLeft('*', Precedence.Multiply, (left, _, right) => new ArithemticOperatorAtom(left, right, (x, y) => x * y))
  .infixLeft('+', Precedence.Add, (left, _, right) => new ArithemticOperatorAtom(left, right, (x, y) => x + y))
  .infixLeft('-', Precedence.Subtract, (left, _, right) => new ArithemticOperatorAtom(left, right, (x, y) => x - y))
  .infixLeft('|', Precedence.Union, (left, _, right) => new UnionAtom(left, right))
  .infixLeft('=', Precedence.Equals, (left, _, right) => new EqualsAtom(left, right))
  .infixLeft('!=', Precedence.Equals, (left, _, right) => new NotEqualsAtom(left, right))
  .infixLeft('~', Precedence.Equivalent, (left, _, right) => new EquivalentAtom(left, right))
  .infixLeft('!~', Precedence.NotEquivalent, (left, _, right) => new NotEquivalentAtom(left, right))
  .infixLeft('<', Precedence.LessThan, (left, _, right) => new ComparisonOperatorAtom(left, right, (x, y) => x < y))
  .infixLeft(
    '<=',
    Precedence.LessThanOrEquals,
    (left, _, right) => new ComparisonOperatorAtom(left, right, (x, y) => x <= y)
  )
  .infixLeft('>', Precedence.GreaterThan, (left, _, right) => new ComparisonOperatorAtom(left, right, (x, y) => x > y))
  .infixLeft(
    '>=',
    Precedence.GreaterThanOrEquals,
    (left, _, right) => new ComparisonOperatorAtom(left, right, (x, y) => x >= y)
  )
  .infixLeft('&', Precedence.Ampersand, (left, _, right) => new ConcatAtom(left, right))
  .infixLeft('Symbol', Precedence.Is, (left: Atom, symbol: Token, right: Atom) => {
    switch (symbol.value) {
      case 'and':
        return new AndAtom(left, right);
      case 'as':
        return new AsAtom(left, right);
      case 'contains':
        return new ContainsAtom(left, right);
      case 'div':
        return new ArithemticOperatorAtom(left, right, (x, y) => (x / y) | 0);
      case 'in':
        return new InAtom(left, right);
      case 'is':
        return new IsAtom(left, right);
      case 'mod':
        return new ArithemticOperatorAtom(left, right, (x, y) => x % y);
      case 'or':
        return new OrAtom(left, right);
      case 'xor':
        return new XorAtom(left, right);
      default:
        throw new Error('Cannot use ' + symbol.value + ' as infix operator');
    }
  });

/**
 * Parses a FHIRPath expression into an AST.
 * The result can be used to evaluate the expression against a resource or other object.
 * This method is useful if you know that you will evaluate the same expression many times
 * against different resources.
 * @param input The FHIRPath expression to parse.
 * @returns The AST representing the expression.
 */
export function parseFhirPath(input: string): FhirPathAtom {
  try {
    return new FhirPathAtom(input, parserBuilder.construct(input).parse());
  } catch (error) {
    throw new Error(`FhirPathError on "${input}": ${error}`);
  }
}

/**
 * Evaluates a FHIRPath expression against a resource or other object.
 * @param input The FHIRPath expression to parse.
 * @param context The resource or object to evaluate the expression against.
 * @returns The result of the FHIRPath expression against the resource or object.
 */
export function evalFhirPath(input: string, context: unknown): unknown[] {
  return parseFhirPath(input).eval(context);
}
