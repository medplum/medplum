import { Quantity } from '@medplum/fhirtypes';
import { Atom, InfixParselet, Parser, ParserBuilder, PrefixParselet } from '../fhirlexer/parse';
import { PropertyType, TypedValue } from '../types';
import {
  AndAtom,
  ArithemticOperatorAtom,
  AsAtom,
  ConcatAtom,
  ContainsAtom,
  DotAtom,
  EmptySetAtom,
  EqualsAtom,
  EquivalentAtom,
  FhirPathAtom,
  FunctionAtom,
  ImpliesAtom,
  InAtom,
  IndexerAtom,
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
import { tokenize } from './tokenize';
import { toTypedValue } from './utils';

/**
 * Operator precedence
 * See: https://hl7.org/fhirpath/#operator-precedence
 */
export const OperatorPrecedence = {
  FunctionCall: 0,
  Dot: 1,
  Indexer: 2,
  UnaryAdd: 3,
  UnarySubtract: 3,
  Multiply: 4,
  Divide: 4,
  IntegerDivide: 4,
  Modulo: 4,
  Add: 5,
  Subtract: 5,
  Ampersand: 5,
  Is: 6,
  As: 6,
  Union: 7,
  GreaterThan: 8,
  GreaterThanOrEquals: 8,
  LessThan: 8,
  LessThanOrEquals: 8,
  Equals: 9,
  Equivalent: 9,
  NotEquals: 9,
  NotEquivalent: 9,
  In: 10,
  Contains: 10,
  And: 11,
  Xor: 12,
  Or: 12,
  Implies: 13,
  Arrow: 100,
  Semicolon: 200,
};

const PARENTHESES_PARSELET: PrefixParselet = {
  parse(parser: Parser) {
    const expr = parser.consumeAndParse();
    if (!parser.match(')')) {
      throw new Error('Parse error: expected `)` got `' + parser.peek()?.value + '`');
    }
    return expr;
  },
};

const INDEXER_PARSELET: InfixParselet = {
  parse(parser: Parser, left: Atom) {
    const expr = parser.consumeAndParse();
    if (!parser.match(']')) {
      throw new Error('Parse error: expected `]`');
    }
    return new IndexerAtom(left, expr);
  },

  precedence: OperatorPrecedence.Indexer,
};

const FUNCTION_CALL_PARSELET: InfixParselet = {
  parse(parser: Parser, left: Atom) {
    if (!(left instanceof SymbolAtom)) {
      throw new Error('Unexpected parentheses');
    }

    const args = [];
    while (!parser.match(')')) {
      args.push(parser.consumeAndParse());
      parser.match(',');
    }

    return new FunctionAtom(left.name, args); //, functions[left.name]);
  },
  precedence: OperatorPrecedence.FunctionCall,
};

function parseQuantity(str: string): Quantity {
  const parts = str.split(' ');
  const value = parseFloat(parts[0]);
  let unit = parts[1];
  if (unit?.startsWith("'") && unit.endsWith("'")) {
    unit = unit.substring(1, unit.length - 1);
  } else {
    unit = '{' + unit + '}';
  }
  return { value, unit };
}

export function initFhirPathParserBuilder(): ParserBuilder {
  return new ParserBuilder()
    .registerPrefix('String', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.string, value: token.value }),
    })
    .registerPrefix('DateTime', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.dateTime, value: parseDateString(token.value) }),
    })
    .registerPrefix('Quantity', {
      parse: (_, token) => new LiteralAtom({ type: PropertyType.Quantity, value: parseQuantity(token.value) }),
    })
    .registerPrefix('Number', {
      parse: (_, token) =>
        new LiteralAtom({
          type: token.value.includes('.') ? PropertyType.decimal : PropertyType.integer,
          value: parseFloat(token.value),
        }),
    })
    .registerPrefix('true', { parse: () => new LiteralAtom({ type: PropertyType.boolean, value: true }) })
    .registerPrefix('false', { parse: () => new LiteralAtom({ type: PropertyType.boolean, value: false }) })
    .registerPrefix('Symbol', { parse: (_, token) => new SymbolAtom(token.value) })
    .registerPrefix('{}', { parse: () => new EmptySetAtom() })
    .registerPrefix('(', PARENTHESES_PARSELET)
    .registerInfix('[', INDEXER_PARSELET)
    .registerInfix('(', FUNCTION_CALL_PARSELET)
    .prefix('+', OperatorPrecedence.UnaryAdd, (_, right) => new UnaryOperatorAtom('+', right, (x) => x))
    .prefix(
      '-',
      OperatorPrecedence.UnarySubtract,
      (_, right) => new ArithemticOperatorAtom('-', right, right, (_, y) => -y)
    )
    .infixLeft('.', OperatorPrecedence.Dot, (left, _, right) => new DotAtom(left, right))
    .infixLeft(
      '/',
      OperatorPrecedence.Divide,
      (left, _, right) => new ArithemticOperatorAtom('/', left, right, (x, y) => x / y)
    )
    .infixLeft(
      '*',
      OperatorPrecedence.Multiply,
      (left, _, right) => new ArithemticOperatorAtom('*', left, right, (x, y) => x * y)
    )
    .infixLeft(
      '+',
      OperatorPrecedence.Add,
      (left, _, right) => new ArithemticOperatorAtom('+', left, right, (x, y) => x + y)
    )
    .infixLeft(
      '-',
      OperatorPrecedence.Subtract,
      (left, _, right) => new ArithemticOperatorAtom('-', left, right, (x, y) => x - y)
    )
    .infixLeft('|', OperatorPrecedence.Union, (left, _, right) => new UnionAtom(left, right))
    .infixLeft('=', OperatorPrecedence.Equals, (left, _, right) => new EqualsAtom(left, right))
    .infixLeft('!=', OperatorPrecedence.NotEquals, (left, _, right) => new NotEqualsAtom(left, right))
    .infixLeft('~', OperatorPrecedence.Equivalent, (left, _, right) => new EquivalentAtom(left, right))
    .infixLeft('!~', OperatorPrecedence.NotEquivalent, (left, _, right) => new NotEquivalentAtom(left, right))
    .infixLeft(
      '<',
      OperatorPrecedence.LessThan,
      (left, _, right) => new ArithemticOperatorAtom('<', left, right, (x, y) => x < y)
    )
    .infixLeft(
      '<=',
      OperatorPrecedence.LessThanOrEquals,
      (left, _, right) => new ArithemticOperatorAtom('<=', left, right, (x, y) => x <= y)
    )
    .infixLeft(
      '>',
      OperatorPrecedence.GreaterThan,
      (left, _, right) => new ArithemticOperatorAtom('>', left, right, (x, y) => x > y)
    )
    .infixLeft(
      '>=',
      OperatorPrecedence.GreaterThanOrEquals,
      (left, _, right) => new ArithemticOperatorAtom('>=', left, right, (x, y) => x >= y)
    )
    .infixLeft('&', OperatorPrecedence.Ampersand, (left, _, right) => new ConcatAtom(left, right))
    .infixLeft('and', OperatorPrecedence.And, (left, _, right) => new AndAtom(left, right))
    .infixLeft('as', OperatorPrecedence.As, (left, _, right) => new AsAtom(left, right))
    .infixLeft('contains', OperatorPrecedence.Contains, (left, _, right) => new ContainsAtom(left, right))
    .infixLeft(
      'div',
      OperatorPrecedence.Divide,
      (left, _, right) => new ArithemticOperatorAtom('div', left, right, (x, y) => (x / y) | 0)
    )
    .infixLeft('in', OperatorPrecedence.In, (left, _, right) => new InAtom(left, right))
    .infixLeft('is', OperatorPrecedence.Is, (left, _, right) => new IsAtom(left, right))
    .infixLeft(
      'mod',
      OperatorPrecedence.Modulo,
      (left, _, right) => new ArithemticOperatorAtom('mod', left, right, (x, y) => x % y)
    )
    .infixLeft('or', OperatorPrecedence.Or, (left, _, right) => new OrAtom(left, right))
    .infixLeft('xor', OperatorPrecedence.Xor, (left, _, right) => new XorAtom(left, right))
    .infixLeft('implies', OperatorPrecedence.Implies, (left, _, right) => new ImpliesAtom(left, right));
}

const fhirPathParserBuilder = initFhirPathParserBuilder();

/**
 * Parses a FHIRPath expression into an AST.
 * The result can be used to evaluate the expression against a resource or other object.
 * This method is useful if you know that you will evaluate the same expression many times
 * against different resources.
 * @param input - The FHIRPath expression to parse.
 * @returns The AST representing the expression.
 */
export function parseFhirPath(input: string): FhirPathAtom {
  return new FhirPathAtom(input, fhirPathParserBuilder.construct(tokenize(input)).consumeAndParse());
}

/**
 * Evaluates a FHIRPath expression against a resource or other object.
 * @param expression - The FHIRPath expression to parse.
 * @param input - The resource or object to evaluate the expression against.
 * @returns The result of the FHIRPath expression against the resource or object.
 */
export function evalFhirPath(expression: string, input: unknown): unknown[] {
  // eval requires a TypedValue array
  // As a convenience, we can accept array or non-array, and TypedValue or unknown value
  const array = Array.isArray(input) ? input : [input];
  for (let i = 0; i < array.length; i++) {
    const el = array[i];
    if (!(typeof el === 'object' && 'type' in el && 'value' in el)) {
      array[i] = toTypedValue(array[i]);
    }
  }
  return evalFhirPathTyped(expression, array).map((e) => e.value);
}

/**
 * Evaluates a FHIRPath expression against a resource or other object.
 * @param expression - The FHIRPath expression to parse.
 * @param input - The resource or object to evaluate the expression against.
 * @param variables - A map of variables for eval input.
 * @returns The result of the FHIRPath expression against the resource or object.
 */
export function evalFhirPathTyped(
  expression: string,
  input: TypedValue[],
  variables: Record<string, TypedValue> = {}
): TypedValue[] {
  const ast = parseFhirPath(expression);
  return ast.eval({ variables }, input).map((v) => ({
    type: v.type,
    value: v.value?.valueOf(),
  }));
}
