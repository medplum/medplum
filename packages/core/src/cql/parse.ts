// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parser } from '../fhirlexer/parse';
import { LiteralAtom } from '../fhirpath/atoms';
import { OperatorPrecedence, initFhirPathParserBuilder } from '../fhirpath/parse';
import { IfAtom, IntervalAtom } from './atoms';
import { tokenize } from './tokenize';
import type {
  CqlAccessModifier,
  CqlDirective,
  CqlExpressionDefinition,
  CqlFunctionDefinition,
  CqlIncludeDefinition,
  CqlLibrary,
  CqlOperandDefinition,
  CqlStatement,
  CqlUsingDefinition,
} from './types';

class CqlParser {
  readonly parser: Parser;
  readonly result: CqlLibrary = {
    definitions: [],
  };

  constructor(parser: Parser) {
    this.parser = parser;
  }

  parse(): CqlLibrary {
    while (this.parser.hasMore()) {
      const next = this.parser.peek()?.value;
      switch (next) {
        case '#':
          this.parseDirective();
          break;
        case 'library':
          this.parseLibrary();
          break;
        case 'using':
          this.parseUsing();
          break;
        case 'include':
          this.parseInclude();
          break;
        default:
          this.parseStatement();
      }
    }
    return this.result;
  }

  private parseDirective(): void {
    // directive
    // : '#' identifier (':' STRING)?
    this.parser.consume('#', '#');
    const directive: CqlDirective = {
      identifier: this.parser.consume('Symbol').value,
    };
    if (this.parser.match(':')) {
      directive.value = this.parser.consume('String').value;
    }
    if (!this.result.directives) {
      this.result.directives = [];
    }
    this.result.directives.push(directive);
  }

  private parseLibrary(): void {
    // libraryDefinition
    //     : 'library' qualifiedIdentifier ('version' versionSpecifier)?
    this.parser.consume('library');
    this.result.qualifiedIdentifier = this.parser.consume('Symbol').value;
    if (this.parser.match('version')) {
      this.result.versionSpecifier = this.parser.consume('String').value;
    }
  }

  private parseUsing(): void {
    // usingDefinition
    //     : 'using' qualifiedIdentifier ('version' versionSpecifier)? ('called' localIdentifier)?
    this.parser.consume('using');
    const using: CqlUsingDefinition = {
      qualifiedIdentifier: this.parser.consume('Symbol').value,
    };
    if (this.parser.match('version')) {
      using.versionSpecifier = this.parser.consume('String').value;
    }
    if (this.parser.match('called')) {
      using.localIdentifier = this.parser.consume('Symbol').value;
    }
    if (!this.result.definitions) {
      this.result.definitions = [];
    }
    this.result.definitions.push(using);
  }

  private parseInclude(): void {
    // includeDefinition
    //     : 'include' qualifiedIdentifier ('version' versionSpecifier)? ('called' localIdentifier)? ('bind' tupleSelector)?
    this.parser.consume('include');
    const include: CqlIncludeDefinition = {
      qualifiedIdentifier: this.parser.consume('Symbol').value,
    };
    if (this.parser.match('version')) {
      include.versionSpecifier = this.parser.consume('String').value;
    }
    if (this.parser.match('called')) {
      include.localIdentifier = this.parser.consume('Symbol').value;
    }
    if (this.parser.match('bind')) {
      include.tupleSelector = this.parser.consume('Symbol').value;
    }
    if (!this.result.definitions) {
      this.result.definitions = [];
    }
    this.result.definitions.push(include);
  }

  private parseStatement(): CqlStatement {
    let result: CqlStatement | undefined = undefined;
    if (this.parser.match('define')) {
      result = this.parseDefine();
    }

    if (result) {
      if (!this.result.statements) {
        this.result.statements = [];
      }
      this.result.statements.push(result);
      return result;
    }

    console.log('Unsupported statement:', this.parser.peek());
    console.log('Current state:', JSON.stringify(this.result, null, 2));
    console.log('Remaining tokens:', this.parser.tokens);
    throw new Error(`Unsupported statement: ${this.parser.peek()?.value}`);
  }

  private parseDefine(): CqlStatement {
    const accessModifier = this.parseAccessModifier();
    const fluent = this.parser.match('fluent');
    let result: CqlStatement;
    if (this.parser.match('function')) {
      result = this.parseFunctionDefinition(accessModifier, fluent);
    } else {
      result = this.parseExpressionDefinition(accessModifier);
    }
    return result;
  }

  private parseAccessModifier(): CqlAccessModifier | undefined {
    const next = this.parser.peek()?.value;
    if (next === 'public' || next === 'private') {
      this.parser.consume(next);
      return next;
    }
    return undefined;
  }

  private parseFunctionDefinition(
    accessModifier: CqlAccessModifier | undefined,
    fluent: boolean
  ): CqlFunctionDefinition {
    // functionDefinition
    //     : 'define' accessModifier? 'fluent'? 'function' identifierOrFunctionIdentifier '(' (operandDefinition (',' operandDefinition)*)? ')'
    //         ('returns' typeSpecifier)?
    //         ':' (functionBody | 'external')
    const result: CqlFunctionDefinition = {
      accessModifier,
      fluent,
      identifier: this.parser.consume('Symbol').value,
      operands: [],
    };
    this.parser.consume('(', '(');

    while (this.parser.peek()?.id !== ')') {
      const operand: CqlOperandDefinition = {
        referentialIdentifier: this.parser.consume('Symbol').value,
        typeSpecifier: this.parseTypeSpecifier(),
      };
      result.operands.push(operand);
      this.parser.match(',');
    }

    this.parser.consume(')');

    if (this.parser.match('returns')) {
      result.returnType = this.parseTypeSpecifier();
    }

    this.parser.consume(':');

    if (this.parser.match('external')) {
      result.isExternal = true;
    } else {
      result.functionBody = this.parseExpression();
    }

    return result;
  }

  private parseExpressionDefinition(accessModifier: CqlAccessModifier | undefined): CqlExpressionDefinition {
    // expressionDefinition
    //     : 'define' accessModifier? identifier ':' expression
    const expression: CqlExpressionDefinition = {
      accessModifier,
      identifier: this.parser.consume('Symbol').value,
    };
    this.parser.consume(':');
    expression.expression = this.parseExpression();
    return expression;
  }

  private parseTypeSpecifier(): string {
    // typeSpecifier
    //     : namedTypeSpecifier
    //     | listTypeSpecifier
    //     | intervalTypeSpecifier
    //     | tupleTypeSpecifier
    //     | choiceTypeSpecifier
    const next = this.parser.peek()?.value;
    switch (next) {
      case 'List':
        return this.parseListTypeSpecifier();
      case 'Interval':
        return this.parseIntervalTypeSpecifier();
      case 'Tuple':
        return this.parseTupleTypeSpecifier();
      case 'Choice':
        return this.parseChoiceTypeSpecifier();
      default:
        return this.parseNamedTypeSpecifier();
    }
  }

  private parseNamedTypeSpecifier(): string {
    // namedTypeSpecifier
    //     : (qualifier '.')* referentialOrTypeNameIdentifier
    //     ;
    let result = '';
    while (this.parser.peek()?.id === 'Symbol') {
      result += this.parser.consume('Symbol').value;
      if (!this.parser.match('.')) {
        break;
      }
    }
    return result;
  }

  private parseListTypeSpecifier(): string {
    // listTypeSpecifier
    //     : 'List' '<' typeSpecifier '>'
    //     ;
    this.parser.consume('List');
    this.parser.consume('<');
    const type = this.parseTypeSpecifier();
    this.parser.consume('>');
    return `List<${type}>`;
  }

  private parseIntervalTypeSpecifier(): string {
    //     : 'Interval' '<' typeSpecifier '>'
    //     ;
    this.parser.consume('Interval');
    this.parser.consume('<');
    const type = this.parseTypeSpecifier();
    this.parser.consume('>');
    return `Interval<${type}>`;
  }

  private parseTupleTypeSpecifier(): string {
    // tupleTypeSpecifier
    //     : 'Tuple' '{' (tupleElementDefinition (',' tupleElementDefinition)*)? '}'
    //     ;
    this.parser.consume('Tuple');
    this.parser.consume('{');
    const elements: string[] = [];
    while (this.parser.peek()?.value !== '}') {
      elements.push(this.parseTupleElementDefinition());
      if (!this.parser.match(',')) {
        break;
      }
    }
    this.parser.consume('}');
    return `Tuple<{${elements.join(', ')}}>`;
  }

  private parseTupleElementDefinition(): string {
    // tupleElementDefinition
    //     : referentialIdentifier typeSpecifier
    //     ;
    const identifier = this.parser.consume('Symbol').value;
    const type = this.parseTypeSpecifier();
    return `${identifier}: ${type}`;
  }

  private parseChoiceTypeSpecifier(): string {
    // choiceTypeSpecifier
    //     : 'Choice' '<' typeSpecifier (',' typeSpecifier)* '>'
    //     ;
    this.parser.consume('Choice');
    this.parser.consume('<');
    const types: string[] = [];
    while (this.parser.peek()?.value !== '>') {
      types.push(this.parseTypeSpecifier());
      if (!this.parser.match(',')) {
        break;
      }
    }
    this.parser.consume('>');
    return `Choice<${types.join(', ')}>`;
  }

  private parseExpression(): any {
    // todo
    return this.parser.consumeAndParse();
  }
}

const cqlParserBuilder = initFhirPathParserBuilder()
  .registerInfix('->', { precedence: OperatorPrecedence.Arrow })
  .registerInfix(';', { precedence: OperatorPrecedence.Semicolon })
  .registerPrefix('null', { parse: () => new LiteralAtom({ type: 'null', value: null }) })
  .registerPrefix('if', {
    parse(parser: Parser) {
      const condition = parser.consumeAndParse();
      parser.consume('then');
      const thenExpr = parser.consumeAndParse();
      const elseExpr = parser.match('else') ? parser.consumeAndParse() : undefined;
      return new IfAtom(condition, thenExpr, elseExpr);
    },
  })
  .registerPrefix('Interval', {
    parse(parser: Parser) {
      parser.consume('[');
      const start = parser.consumeAndParse();
      parser.consume(',');
      const end = parser.consumeAndParse();
      parser.consume(']');
      return new IntervalAtom(start, end);
    },
  });

/**
 * Parses a CQL document into an AST.
 * @param input - The CQL document to parse.
 * @returns The AST representing the document.
 */
export function parseCql(input: string): CqlLibrary {
  const parser = cqlParserBuilder.construct(tokenize(input));
  parser.removeComments();
  return new CqlParser(parser).parse();
}
