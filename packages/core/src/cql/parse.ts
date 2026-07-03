// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parser } from '../fhirlexer/parse';
import { OperatorPrecedence, initFhirPathParserBuilder } from '../fhirpath/parse';
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
    if (this.parser.tryConsume(':')) {
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
    this.parser.consume('Symbol', 'library');
    this.result.qualifiedIdentifier = this.parser.consume('Symbol').value;
    if (this.parser.tryConsume('Symbol', 'version')) {
      this.result.versionSpecifier = this.parser.consume('String').value;
    }
  }

  private parseUsing(): void {
    // usingDefinition
    //     : 'using' qualifiedIdentifier ('version' versionSpecifier)? ('called' localIdentifier)?
    this.parser.consume('Symbol', 'using');
    const using: CqlUsingDefinition = {
      qualifiedIdentifier: this.parser.consume('Symbol').value,
    };
    if (this.parser.tryConsume('Symbol', 'version')) {
      using.versionSpecifier = this.parser.consume('String').value;
    }
    if (this.parser.tryConsume('Symbol', 'called')) {
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
    this.parser.consume('Symbol', 'include');
    const include: CqlIncludeDefinition = {
      qualifiedIdentifier: this.parser.consume('Symbol').value,
    };
    if (this.parser.tryConsume('Symbol', 'version')) {
      include.versionSpecifier = this.parser.consume('String').value;
    }
    if (this.parser.tryConsume('Symbol', 'called')) {
      include.localIdentifier = this.parser.consume('Symbol').value;
    }
    if (this.parser.tryConsume('Symbol', 'bind')) {
      include.tupleSelector = this.parser.consume('Symbol').value;
    }
    if (!this.result.definitions) {
      this.result.definitions = [];
    }
    this.result.definitions.push(include);
  }

  private parseStatement(): CqlStatement {
    let result: CqlStatement | undefined = undefined;
    if (this.parser.tryConsume('Symbol', 'define')) {
      result = this.parseDefine();
    }

    if (result) {
      if (!this.result.statements) {
        this.result.statements = [];
      }
      this.result.statements.push(result);
      return result;
    }

    throw new Error('Unsupported statement');
  }

  private parseDefine(): CqlStatement {
    const accessModifier = this.parseAccessModifier();
    const fluent = this.parser.tryConsume('Symbol', 'fluent');
    let result: CqlStatement;
    if (this.parser.tryConsume('Symbol', 'function')) {
      result = this.parseFunctionDefinition(accessModifier, fluent !== undefined);
    } else {
      result = this.parseExpressionDefinition(accessModifier);
    }
    return result;
  }

  private parseAccessModifier(): CqlAccessModifier | undefined {
    const next = this.parser.peek()?.value;
    if (next === 'public' || next === 'private') {
      this.parser.consume('Symbol', next);
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
    this.parser.consume('Symbol', '(');

    while (this.parser.peek()?.id !== 'Symbol' || this.parser.peek()?.value !== ')') {
      const operand: CqlOperandDefinition = {
        referentialIdentifier: this.parser.consume('Symbol').value,
        typeSpecifier: this.parser.consume('Symbol').value,
      };
      result.operands.push(operand);
      if (this.parser.peek()?.value === ',') {
        this.parser.consume('Symbol', ',');
      }
    }

    this.parser.consume('Symbol', ')');

    if (this.parser.tryConsume('Symbol', 'returns')) {
      result.returnType = this.parser.consume('Symbol').value;
    }

    this.parser.consume('Symbol', ':');

    if (this.parser.tryConsume('Symbol', 'external')) {
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

  private parseExpression(): any {
    // todo
    return this.parser.consumeAndParse();
  }
}

const cqlParserBuilder = initFhirPathParserBuilder()
  .registerInfix('->', { precedence: OperatorPrecedence.Arrow })
  .registerInfix(';', { precedence: OperatorPrecedence.Semicolon });

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
