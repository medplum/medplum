import {
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleDependent,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
  StructureMapStructure,
} from '@medplum/fhirtypes';
import { Parser } from '../fhirlexer';
import { FunctionAtom, initFhirPathParserBuilder, LiteralAtom, OperatorPrecedence, SymbolAtom } from '../fhirpath';
import { tokenize } from './tokenize';

class StructureMapParser {
  readonly structureMap: StructureMap = { resourceType: 'StructureMap' };
  constructor(readonly parser: Parser) {}

  parse(): StructureMap {
    // 'map' url '=' identifier
    // map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    this.parser.consume('Symbol', 'map');
    this.structureMap.url = this.parser.consume('String').value;
    this.parser.consume('=');
    this.structureMap.name = this.parser.consume().value;
    while (this.parser.hasMore()) {
      const next = this.parser.peek()?.value;
      switch (next) {
        case 'uses':
          this.parseUses();
          break;
        case 'imports':
          this.parseImport();
          break;
        case 'group':
          this.parseGroup();
          break;
        case 'conceptmap':
          this.parseConceptMap();
          break;
        default:
          throw new Error(`Unexpected token: ${next}`);
      }
    }
    return this.structureMap;
  }

  private parseUses(): void {
    // 'uses' url structureAlias? 'as' modelMode
    // uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    this.parser.consume('Symbol', 'uses');
    const result: StructureMapStructure = {};
    result.url = this.parser.consume('String').value;
    if (this.parser.peek()?.value === 'alias') {
      this.parser.consume('Symbol', 'alias');
      result.alias = this.parser.consume('Symbol').value;
    }
    this.parser.consume('Symbol', 'as');
    result.mode = this.parser.consume().value as 'source' | 'queried' | 'target' | 'produced';
    if (!this.structureMap.structure) {
      this.structureMap.structure = [];
    }
    this.structureMap.structure.push(result);
  }

  private parseImport(): void {
    this.parser.consume('Symbol', 'imports');
    if (!this.structureMap.import) {
      this.structureMap.import = [];
    }
    this.structureMap.import.push(this.parser.consume('String').value);
  }

  private parseGroup(): void {
    // 'group' identifier parameters extends? typeMode? rules
    // group tutorial(source src : TLeft, target tgt : TRight) {
    const result: StructureMapGroup = {};
    this.parser.consume('Symbol', 'group');
    result.name = this.parser.consume('Symbol').value;
    result.input = this.parseParameters();

    if (this.parser.peek()?.value === 'extends') {
      this.parser.consume('Symbol', 'extends');
      result.extends = this.parser.consume('Symbol').value;
    }

    if (this.parser.peek()?.value === '<<') {
      this.parser.consume('<<');
      result.typeMode = this.parser.consume().value as 'none' | 'types' | 'type-and-types';
      if (this.parser.peek()?.value === '+') {
        this.parser.consume('+');
        result.typeMode = 'type-and-types';
      }
      this.parser.consume('>>');
    } else {
      result.typeMode = 'none';
    }

    result.rule = this.parseRules();

    if (!this.structureMap.group) {
      this.structureMap.group = [];
    }
    this.structureMap.group.push(result);
  }

  private parseParameters(): StructureMapGroupInput[] {
    const parameters: StructureMapGroupInput[] = [];
    this.parser.consume('(');
    while (this.parser.hasMore() && this.parser.peek()?.value !== ')') {
      parameters.push(this.parseParameter());
      if (this.parser.peek()?.value === ',') {
        this.parser.consume(',');
      }
    }
    this.parser.consume(')');
    return parameters;
  }

  private parseParameter(): StructureMapGroupInput {
    // inputMode identifier type?
    // ':' identifier
    // source src : TLeft
    const result: StructureMapGroupInput = {};
    result.mode = this.parser.consume().value as 'source' | 'target';
    result.name = this.parser.consume('Symbol').value;
    if (this.parser.peek()?.value === ':') {
      this.parser.consume(':');
      result.type = this.parser.consume('Symbol').value;
    }
    return result;
  }

  private parseRules(): StructureMapGroupRule[] {
    const rules = [];
    this.parser.consume('{');
    while (this.parser.hasMore() && this.parser.peek()?.value !== '}') {
      rules.push(this.parseRule());
    }
    this.parser.consume('}');
    return rules;
  }

  private parseRule(): StructureMapGroupRule {
    const result: StructureMapGroupRule = {
      source: this.parseRuleSources(),
    };

    if (this.parser.peek()?.value === '->') {
      this.parser.consume('->');
      result.target = this.parseRuleTargets();
    }

    if (this.parser.peek()?.value === 'then') {
      this.parser.consume('Symbol', 'then');
      if (this.parser.peek()?.id === '{') {
        result.rule = this.parseRules();
      } else {
        result.dependent = this.parseRuleDependents();
      }
    }

    if (this.parser.peek()?.id === 'String') {
      result.name = this.parser.consume().value;
    } else {
      result.name = result.source?.[0]?.element;
    }

    this.parser.consume(';');
    return result;
  }

  private parseRuleSources(): StructureMapGroupRuleSource[] {
    const sources = [this.parseRuleSource()];
    while (this.parser.hasMore() && this.parser.peek()?.value === ',') {
      this.parser.consume(',');
      sources.push(this.parseRuleSource());
    }
    return sources;
  }

  private parseRuleSource(): StructureMapGroupRuleSource {
    const result: StructureMapGroupRuleSource = {};

    const context = this.parseRuleContext();
    if (context.includes('.')) {
      const parts = context.split('.');
      result.context = parts[0];
      result.element = parts[1];
    } else {
      result.context = context;
    }

    if (this.parser.hasMore() && this.parser.peek()?.value === ':') {
      this.parser.consume(':');
      result.type = this.parser.consume().value;
    }

    if (this.parser.hasMore() && this.parser.peek()?.value === 'default') {
      this.parser.consume('default');
      this.parser.consumeAndParse();
    }

    if (
      this.parser.peek()?.value === 'first' ||
      this.parser.peek()?.value === 'not_first' ||
      this.parser.peek()?.value === 'last' ||
      this.parser.peek()?.value === 'not_last' ||
      this.parser.peek()?.value === 'only_one'
    ) {
      result.listMode = this.parser.consume().value as 'first' | 'not_first' | 'last' | 'not_last' | 'only_one';
    }

    if (this.parser.peek()?.value === 'as') {
      this.parser.consume('Symbol', 'as');
      result.variable = this.parser.consume().value;
    }

    if (this.parser.peek()?.value === 'where') {
      this.parser.consume('Symbol', 'where');
      const whereFhirPath = this.parser.consumeAndParse(OperatorPrecedence.Arrow);
      result.condition = whereFhirPath.toString();
    }

    if (this.parser.peek()?.value === 'check') {
      this.parser.consume('Symbol', 'check');
      const checkFhirPath = this.parser.consumeAndParse(OperatorPrecedence.Arrow);
      result.check = checkFhirPath.toString();
    }

    return result;
  }

  private parseRuleTargets(): StructureMapGroupRuleTarget[] {
    const targets = [this.parseRuleTarget()];
    while (this.parser.hasMore() && this.parser.peek()?.value === ',') {
      this.parser.consume(',');
      targets.push(this.parseRuleTarget());
    }
    return targets;
  }

  private parseRuleTarget(): StructureMapGroupRuleTarget {
    const result: StructureMapGroupRuleTarget = {};

    const context = this.parseRuleContext();
    if (context.includes('.')) {
      const parts = context.split('.');
      result.contextType = 'variable';
      result.context = parts[0];
      result.element = parts[1];
    } else {
      result.context = context;
    }

    if (this.parser.peek()?.value === '=') {
      this.parser.consume('=');
      this.parseRuleTargetTransform(result);
    }

    if (this.parser.peek()?.value === 'as') {
      this.parser.consume('Symbol', 'as');
      result.variable = this.parser.consume().value;
    }

    if (
      this.parser.peek()?.value === 'first' ||
      this.parser.peek()?.value === 'share' ||
      this.parser.peek()?.value === 'last' ||
      this.parser.peek()?.value === 'collate'
    ) {
      result.listMode = [this.parser.consume().value as 'first' | 'share' | 'last' | 'collate'];
    }

    return result;
  }

  private parseRuleTargetTransform(result: StructureMapGroupRuleTarget): void {
    result.transform = 'copy';

    const transformFhirPath = this.parser.consumeAndParse(OperatorPrecedence.As);
    if (transformFhirPath instanceof SymbolAtom) {
      this.parseRuleTargetSymbol(result, transformFhirPath);
    } else if (transformFhirPath instanceof FunctionAtom) {
      this.parseRuleTargetFunction(result, transformFhirPath);
    } else if (transformFhirPath instanceof LiteralAtom) {
      this.parseRuleTargetLiteral(result, transformFhirPath);
    } else {
      throw new Error(`Unexpected FHIRPath: ${transformFhirPath}`);
    }
  }

  private parseRuleTargetSymbol(result: StructureMapGroupRuleTarget, literalAtom: SymbolAtom): void {
    result.parameter = [{ valueId: literalAtom.name }];
  }

  private parseRuleTargetFunction(result: StructureMapGroupRuleTarget, functionAtom: FunctionAtom): void {
    const functionName = functionAtom.name;
    switch (functionName) {
      case 'create':
        result.parameter = [
          {
            valueString: (functionAtom.args[0] as LiteralAtom).value.value as string,
          },
        ];
        break;

      case 'translate':
        result.parameter = [{}];
        break;

      default:
        throw new Error('Unknown target function: ' + functionName);
    }
  }

  private parseRuleTargetLiteral(result: StructureMapGroupRuleTarget, literalAtom: LiteralAtom): void {
    switch (literalAtom.value.type) {
      case 'boolean':
        result.parameter = [{ valueBoolean: literalAtom.value.value as boolean }];
        break;
      case 'decimal':
        result.parameter = [{ valueDecimal: literalAtom.value.value as number }];
        break;
      case 'string':
        result.parameter = [{ valueString: literalAtom.value.value as string }];
        break;
      default:
        throw new Error('Unknown target literal type: ' + literalAtom.value.type);
    }
  }

  private parseRuleContext(): string {
    let identifier = this.parser.consume().value;
    while (this.parser.peek()?.value === '.') {
      this.parser.consume('.');
      identifier += '.' + this.parser.consume().value;
    }
    return identifier;
  }

  private parseRuleDependents(): StructureMapGroupRuleDependent[] | undefined {
    const atom = this.parser.consumeAndParse(OperatorPrecedence.Arrow) as FunctionAtom;
    return [
      {
        name: atom.name,
        variable: atom.args.map((arg) => (arg as SymbolAtom).name),
      },
    ];
  }

  private parseConceptMap(): void {
    while (this.parser.peek()?.value !== '}') {
      this.parser.consume();
    }
    this.parser.consume('}');
  }
}

const fhirPathParserBuilder = initFhirPathParserBuilder()
  .registerInfix('->', { precedence: OperatorPrecedence.Arrow })
  .registerInfix(';', { precedence: OperatorPrecedence.Semicolon });

/**
 * Parses a FHIR Mapping Language document into an AST.
 * @param input The FHIR Mapping Language document to parse.
 * @returns The AST representing the document.
 */
export function parseMappingLanguage(input: string): StructureMap {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();
  return new StructureMapParser(parser).parse();
}
