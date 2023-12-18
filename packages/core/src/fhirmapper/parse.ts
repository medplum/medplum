import {
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleDependent,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
  StructureMapGroupRuleTargetParameter,
  StructureMapStructure,
} from '@medplum/fhirtypes';
import { Atom, Parser } from '../fhirlexer/parse';
import { FunctionAtom, LiteralAtom, SymbolAtom } from '../fhirpath/atoms';
import { OperatorPrecedence, initFhirPathParserBuilder } from '../fhirpath/parse';
import { tokenize } from './tokenize';

class StructureMapParser {
  readonly structureMap: StructureMap = { resourceType: 'StructureMap' };
  constructor(readonly parser: Parser) {}

  parse(): StructureMap {
    while (this.parser.hasMore()) {
      const next = this.parser.peek()?.value;
      switch (next) {
        case 'map':
          this.parseMap();
          break;
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

  private parseMap(): void {
    // 'map' url '=' identifier
    // map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    this.parser.consume('Symbol', 'map');
    this.structureMap.url = this.parser.consume('String').value;
    this.parser.consume('=');
    this.structureMap.name = this.parser.consume().value;
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
    const parts = context.split('.');
    result.context = parts[0];
    result.element = parts[1];

    if (this.parser.hasMore() && this.parser.peek()?.value === ':') {
      this.parser.consume(':');
      result.type = this.parser.consume().value;
    }

    if (this.parser.hasMore() && this.parser.peek()?.value === 'default') {
      this.parser.consume('Symbol', 'default');
      result.defaultValueString = this.parser.consume('String').value;
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

    if (this.parser.peek()?.value === 'log') {
      this.parser.consume('Symbol', 'log');
      result.logMessage = this.parser.consume('String').value;
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
    const parts = context.split('.');
    result.contextType = 'variable';
    result.context = parts[0];
    result.element = parts[1];

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
      result.parameter = [{ valueId: transformFhirPath.toString() }];
    }
  }

  private parseRuleTargetSymbol(result: StructureMapGroupRuleTarget, literalAtom: SymbolAtom): void {
    result.parameter = [{ valueId: literalAtom.name }];
  }

  private parseRuleTargetFunction(result: StructureMapGroupRuleTarget, functionAtom: FunctionAtom): void {
    // https://hl7.org/fhir/r4/valueset-map-transform.html
    result.transform = functionAtom.name as 'copy';
    result.parameter = functionAtom.args?.map(atomToParameter);
  }

  private parseRuleTargetLiteral(result: StructureMapGroupRuleTarget, literalAtom: LiteralAtom): void {
    result.parameter = [literalToParameter(literalAtom)];
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

function atomToParameter(atom: Atom): StructureMapGroupRuleTargetParameter {
  if (atom instanceof SymbolAtom) {
    return { valueId: atom.name };
  }
  if (atom instanceof LiteralAtom) {
    return literalToParameter(atom);
  }
  throw new Error('Unexpected atom: ' + atom.constructor.name);
}

function literalToParameter(literalAtom: LiteralAtom): StructureMapGroupRuleTargetParameter {
  switch (literalAtom.value.type) {
    case 'boolean':
      return { valueBoolean: literalAtom.value.value as boolean };
    case 'decimal':
      return { valueDecimal: literalAtom.value.value as number };
    case 'integer':
      return { valueInteger: literalAtom.value.value as number };
    case 'string':
      return { valueString: literalAtom.value.value as string };
    default:
      throw new Error('Unknown target literal type: ' + literalAtom.value.type);
  }
}

const fhirPathParserBuilder = initFhirPathParserBuilder()
  .registerInfix('->', { precedence: OperatorPrecedence.Arrow })
  .registerInfix(';', { precedence: OperatorPrecedence.Semicolon });

/**
 * Parses a FHIR Mapping Language document into an AST.
 * @param input - The FHIR Mapping Language document to parse.
 * @returns The AST representing the document.
 */
export function parseMappingLanguage(input: string): StructureMap {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();
  return new StructureMapParser(parser).parse();
}
