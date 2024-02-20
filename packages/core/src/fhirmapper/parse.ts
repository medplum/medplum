import {
  ConceptMap,
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

/**
 * Mapping from FHIR Mapping Language equivalence operators to FHIR ConceptMap equivalence codes.
 *
 * See: https://build.fhir.org/mapping.g4 for FHIR Mapping Language operators.
 *
 * See: https://hl7.org/fhir/r4/valueset-concept-map-equivalence.html for ConceptMap equivalence codes.
 *
 * @internal
 */
const CONCEPT_MAP_EQUIVALENCE: Record<string, string> = {
  '-': 'disjoint',
  '==': 'equal',
};

class StructureMapParser {
  readonly structureMap: Partial<StructureMap> = {
    resourceType: 'StructureMap',
    status: 'active',
  };

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
    return this.structureMap as StructureMap;
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
    const result: Partial<StructureMapStructure> = {};
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
    this.structureMap.structure.push(result as StructureMapStructure);
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
    const result: Partial<StructureMapGroup> = {};
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
    this.structureMap.group.push(result as StructureMapGroup);
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
    const result: Partial<StructureMapGroupInput> = {};
    result.mode = this.parser.consume().value as 'source' | 'target';
    result.name = this.parser.consume('Symbol').value;
    if (this.parser.peek()?.value === ':') {
      this.parser.consume(':');
      result.type = this.parser.consume('Symbol').value;
    }
    return result as StructureMapGroupInput;
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
    const result: Partial<StructureMapGroupRule> = {
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
    return result as StructureMapGroupRule;
  }

  private parseRuleSources(): StructureMapGroupRuleSource[] {
    if (this.parser.hasMore() && this.parser.peek()?.value === 'for') {
      // The "for" keyword is optional
      // It is not in the official grammar: https://build.fhir.org/mapping.g4
      // But it is used in the examples: https://build.fhir.org/mapping-tutorial.html
      this.parser.consume('Symbol', 'for');
    }
    const sources = [this.parseRuleSource()];
    while (this.parser.hasMore() && this.parser.peek()?.value === ',') {
      this.parser.consume(',');
      sources.push(this.parseRuleSource());
    }
    return sources;
  }

  private parseRuleSource(): StructureMapGroupRuleSource {
    const result: Partial<StructureMapGroupRuleSource> = {};

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
      result.logMessage = this.parser.consume().value;
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

    return result as StructureMapGroupRuleSource;
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

    if (this.parser.peek()?.value === 'share') {
      this.parser.consume('Symbol', 'share');
      result.listMode = ['share'];
      this.parser.consume('Symbol'); // NB: Not in the spec, but used by FHIRCH maps
    }

    if (
      this.parser.peek()?.value === 'first' ||
      this.parser.peek()?.value === 'last' ||
      this.parser.peek()?.value === 'collate'
    ) {
      result.listMode = [this.parser.consume().value as 'first' | 'last' | 'collate'];
    }

    return result;
  }

  private parseRuleTargetTransform(result: StructureMapGroupRuleTarget): void {
    const transformAtom = this.parser.consumeAndParse(OperatorPrecedence.As);
    if (transformAtom instanceof FunctionAtom) {
      result.transform = transformAtom.name as 'append' | 'truncate';
      result.parameter = transformAtom.args?.map(atomToParameter);
    } else if (transformAtom instanceof LiteralAtom || transformAtom instanceof SymbolAtom) {
      result.transform = 'copy';
      result.parameter = [atomToParameter(transformAtom)];
    } else {
      result.transform = 'evaluate';
      result.parameter = [{ valueString: transformAtom.toString() }];
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
    this.parser.consume('Symbol', 'conceptmap');

    const conceptMap = { resourceType: 'ConceptMap', status: 'active' } as Partial<ConceptMap>;
    conceptMap.url = this.parser.consume('String').value;

    this.parser.consume('{');

    const prefixes: Record<string, string> = {};

    let next = this.parser.peek()?.value;
    while (next !== '}') {
      if (next === 'prefix') {
        this.parseConceptMapPrefix(prefixes);
      } else {
        this.parseConceptMapRule(conceptMap, prefixes);
      }
      next = this.parser.peek()?.value;
    }
    this.parser.consume('}');

    if (!this.structureMap.contained) {
      this.structureMap.contained = [];
    }
    this.structureMap.contained.push(conceptMap as ConceptMap);
  }

  private parseConceptMapPrefix(prefixes: Record<string, string>): void {
    this.parser.consume('Symbol', 'prefix');
    const prefix = this.parser.consume().value;
    this.parser.consume('=');
    const uri = this.parser.consume().value;
    prefixes[prefix] = uri;
  }

  private parseConceptMapRule(conceptMap: Partial<ConceptMap>, prefixes: Record<string, string>): void {
    const sourcePrefix = this.parser.consume().value;
    const sourceSystem = prefixes[sourcePrefix];
    this.parser.consume(':');
    const sourceCode = this.parser.consume().value;
    const equivalence = CONCEPT_MAP_EQUIVALENCE[this.parser.consume().value] as 'relatedto';
    const targetPrefix = this.parser.consume().value;
    const targetSystem = prefixes[targetPrefix];
    this.parser.consume(':');
    const targetCode = this.parser.consume().value;

    let group = conceptMap?.group?.find((g) => g.source === sourceSystem && g.target === targetSystem);

    if (!group) {
      group = { source: sourceSystem, target: targetSystem, element: [] };
      if (!conceptMap.group) {
        conceptMap.group = [];
      }
      conceptMap.group.push(group);
    }

    if (!group.element) {
      group.element = [];
    }

    group.element.push({
      code: sourceCode,
      target: [{ code: targetCode, equivalence }],
    });
  }
}

function atomToParameter(atom: Atom): StructureMapGroupRuleTargetParameter {
  if (atom instanceof SymbolAtom) {
    return { valueId: atom.name };
  }
  if (atom instanceof LiteralAtom) {
    return literalToParameter(atom);
  }
  throw new Error(`Unknown parameter atom type: ${atom.constructor.name} (${atom.toString()})`);
}

function literalToParameter(literalAtom: LiteralAtom): StructureMapGroupRuleTargetParameter {
  switch (literalAtom.value.type) {
    case 'boolean':
      return { valueBoolean: literalAtom.value.value as boolean };
    case 'decimal':
      return { valueDecimal: literalAtom.value.value as number };
    case 'integer':
      return { valueInteger: literalAtom.value.value as number };
    case 'dateTime':
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
