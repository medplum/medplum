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
  parse(parser: Parser): StructureMap {
    // 'map' url '=' identifier
    // map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    const result: StructureMap = { resourceType: 'StructureMap' };
    parser.consume('Symbol', 'map');
    result.url = parser.consume('String').value;
    parser.consume('=');
    result.name = parser.consume().value;

    while (parser.hasMore()) {
      const next = parser.peek()?.value;
      if (next === 'uses') {
        if (!result.structure) {
          result.structure = [];
        }
        result.structure.push(this.parseUses(parser));
      } else if (next === 'imports') {
        if (!result.import) {
          result.import = [];
        }
        result.import.push(this.parseImport(parser));
      } else if (next === 'group') {
        if (!result.group) {
          result.group = [];
        }
        result.group.push(this.parseGroup(parser));
      } else if (next === 'conceptmap') {
        while (parser.hasMore() && parser.peek()?.value !== '}') {
          parser.consume();
        }
        parser.consume('}');
      } else {
        throw new Error('Unrecognized token: ' + next);
      }
    }

    return result;
  }

  parseUses(parser: Parser): StructureMapStructure {
    // 'uses' url structureAlias? 'as' modelMode
    // uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    parser.consume('Symbol', 'uses');
    const result: StructureMapStructure = {};
    result.url = parser.consume('String').value;
    if (parser.peek()?.value === 'alias') {
      parser.consume('Symbol', 'alias');
      result.alias = parser.consume('Symbol').value;
    }
    parser.consume('Symbol', 'as');
    result.mode = parser.consume().value as 'source' | 'queried' | 'target' | 'produced';
    return result;
  }

  parseImport(parser: Parser): string {
    parser.consume('Symbol', 'imports');
    return parser.consume('String').value;
  }

  parseGroup(parser: Parser): StructureMapGroup {
    // 'group' identifier parameters extends? typeMode? rules
    // group tutorial(source src : TLeft, target tgt : TRight) {
    const result: StructureMapGroup = {};
    parser.consume('Symbol', 'group');
    result.name = parser.consume('Symbol').value;
    result.input = this.parseParameters(parser);

    if (parser.peek()?.value === 'extends') {
      parser.consume('Symbol', 'extends');
      result.extends = parser.consume('Symbol').value;
    }

    if (parser.peek()?.value === '<<') {
      parser.consume('<<');
      result.typeMode = parser.consume().value as 'none' | 'types' | 'type-and-types';
      if (parser.peek()?.value === '+') {
        parser.consume('+');
        result.typeMode = 'type-and-types';
      }
      parser.consume('>>');
    } else {
      result.typeMode = 'none';
    }

    result.rule = this.parseRules(parser);
    return result;
  }

  parseParameters(parser: Parser): StructureMapGroupInput[] {
    const parameters: StructureMapGroupInput[] = [];
    parser.consume('(');
    while (parser.hasMore() && parser.peek()?.value !== ')') {
      parameters.push((this as any).parseParameter(parser));
      if (parser.peek()?.value === ',') {
        parser.consume(',');
      }
    }
    parser.consume(')');
    return parameters;
  }

  parseParameter(parser: Parser): StructureMapGroupInput {
    // inputMode identifier type?
    // ':' identifier
    // source src : TLeft
    const result: StructureMapGroupInput = {};
    result.mode = parser.consume().value as 'source' | 'target';
    result.name = parser.consume('Symbol').value;
    if (parser.peek()?.value === ':') {
      parser.consume(':');
      result.type = parser.consume('Symbol').value;
    }
    return result;
  }

  parseRules(parser: Parser): StructureMapGroupRule[] {
    const rules = [];
    parser.consume('{');
    while (parser.hasMore() && parser.peek()?.value !== '}') {
      rules.push(this.parseRule(parser));
    }
    parser.consume('}');
    return rules;
  }

  parseRule(parser: Parser): StructureMapGroupRule {
    const result: StructureMapGroupRule = {
      source: this.parseRuleSources(parser),
    };

    if (parser.peek()?.value === '->') {
      parser.consume('->');
      result.target = this.parseRuleTargets(parser);
    }

    if (parser.peek()?.value === 'then') {
      parser.consume('Symbol', 'then');
      if (parser.peek()?.id === '{') {
        result.rule = this.parseRules(parser);
      } else {
        result.dependent = this.parseRuleDependents(parser);
      }
    }

    if (parser.peek()?.id === 'String') {
      result.name = parser.consume().value;
    } else {
      result.name = result.source?.[0]?.element;
    }

    parser.consume(';');
    return result;
  }

  parseRuleSources(parser: Parser): StructureMapGroupRuleSource[] {
    const sources = [this.parseRuleSource(parser)];
    while (parser.hasMore() && parser.peek()?.value === ',') {
      parser.consume(',');
      sources.push(this.parseRuleSource(parser));
    }
    return sources;
  }

  parseRuleSource(parser: Parser): StructureMapGroupRuleSource {
    const result: StructureMapGroupRuleSource = {};

    const context = this.parseRuleContext(parser);
    if (context.includes('.')) {
      const parts = context.split('.');
      result.context = parts[0];
      result.element = parts[1];
    } else {
      result.context = context;
    }

    if (parser.hasMore() && parser.peek()?.value === ':') {
      parser.consume(':');
      result.type = parser.consume().value;
    }

    if (parser.hasMore() && parser.peek()?.value === 'default') {
      parser.consume('default');
      parser.consumeAndParse();
    }

    if (
      parser.peek()?.value === 'first' ||
      parser.peek()?.value === 'not_first' ||
      parser.peek()?.value === 'last' ||
      parser.peek()?.value === 'not_last' ||
      parser.peek()?.value === 'only_one'
    ) {
      result.listMode = parser.consume().value as 'first' | 'not_first' | 'last' | 'not_last' | 'only_one';
    }

    if (parser.peek()?.value === 'as') {
      parser.consume('Symbol', 'as');
      result.variable = parser.consume().value;
    }

    if (parser.peek()?.value === 'where') {
      parser.consume('Symbol', 'where');
      const whereFhirPath = parser.consumeAndParse(OperatorPrecedence.Arrow);
      result.condition = whereFhirPath.toString();
    }

    return result;
  }

  parseRuleTargets(parser: Parser): StructureMapGroupRuleTarget[] {
    const targets = [this.parseRuleTarget(parser)];
    while (parser.hasMore() && parser.peek()?.value === ',') {
      parser.consume(',');
      targets.push(this.parseRuleTarget(parser));
    }
    return targets;
  }

  parseRuleTarget(parser: Parser): StructureMapGroupRuleTarget {
    const result: StructureMapGroupRuleTarget = {};

    const context = this.parseRuleContext(parser);
    if (context.includes('.')) {
      const parts = context.split('.');
      result.contextType = 'variable';
      result.context = parts[0];
      result.element = parts[1];
    } else {
      result.context = context;
    }

    if (parser.peek()?.value === '=') {
      parser.consume('=');
      result.transform = 'copy';

      const transformFhirPath = parser.consumeAndParse(OperatorPrecedence.As);
      if (transformFhirPath instanceof SymbolAtom) {
        result.parameter = [
          {
            valueId: transformFhirPath.name,
          },
        ];
      } else if (transformFhirPath instanceof FunctionAtom) {
        const functionName = transformFhirPath.name;
        switch (functionName) {
          case 'create':
            result.parameter = [
              {
                valueString: (transformFhirPath.args?.[0] as LiteralAtom).value.value as string,
              },
            ];
            break;

          case 'translate':
            result.parameter = [{}];
            break;

          default:
            console.log('Unknown function', functionName);
            console.log('transformFhirPath', transformFhirPath);
        }
      } else if (transformFhirPath instanceof LiteralAtom) {
        switch (transformFhirPath.value.type) {
          case 'boolean':
            result.parameter = [{ valueBoolean: transformFhirPath.value.value as boolean }];
            break;
          case 'decimal':
            result.parameter = [{ valueDecimal: transformFhirPath.value.value as number }];
            break;
          case 'string':
            result.parameter = [{ valueString: transformFhirPath.value.value as string }];
            break;
          default:
            console.log('Unknown transform literal:', transformFhirPath);
        }
      } else {
        console.log('Unknown transformFhirPath', transformFhirPath);
        console.log(JSON.stringify(transformFhirPath, null, 2));
      }
    }

    if (parser.peek()?.value === 'as') {
      parser.consume('Symbol', 'as');
      result.variable = parser.consume().value;
    }

    if (
      parser.peek()?.value === 'first' ||
      parser.peek()?.value === 'share' ||
      parser.peek()?.value === 'last' ||
      parser.peek()?.value === 'collate'
    ) {
      result.listMode = [parser.consume().value as 'first' | 'share' | 'last' | 'collate'];
    }

    return result;
  }

  parseRuleContext(parser: Parser): string {
    let identifier = parser.consume().value;
    while (parser.peek()?.value === '.') {
      parser.consume('.');
      identifier += '.' + parser.consume().value;
    }
    return identifier;
  }

  parseRuleDependents(parser: Parser): StructureMapGroupRuleDependent[] | undefined {
    const atom = parser.consumeAndParse(OperatorPrecedence.Arrow) as FunctionAtom;
    return [
      {
        name: atom.name,
        variable: atom.args.map((arg) => (arg as SymbolAtom).name),
      },
    ];
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
  return new StructureMapParser().parse(parser);
}
