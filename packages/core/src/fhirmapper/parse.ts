import {
  StructureMap,
  StructureMapGroup,
  StructureMapGroupInput,
  StructureMapGroupRule,
  StructureMapGroupRuleSource,
  StructureMapGroupRuleTarget,
  StructureMapStructure,
} from '@medplum/fhirtypes';
import { Atom, Parser, PrefixParselet } from '../fhirlexer';
import { initFhirPathParserBuilder } from '../fhirpath';
import { tokenize } from './tokenize';

export class StructureMapAtom implements Atom {
  constructor(public readonly structureMap: StructureMap) {}

  eval(): never {
    throw new Error('Not implemented');
  }
}

class StructureMapParser implements PrefixParselet {
  parse(parser: Parser): StructureMapAtom {
    // 'map' url '=' identifier
    // map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    const url = parser.consume('String').value;
    parser.consume('=');
    const name = parser.consume('Symbol').value;

    const result: StructureMap = {
      resourceType: 'StructureMap',
      url,
      name,
    };

    while (parser.hasMore()) {
      if (parser.peek()?.value === 'uses') {
        if (!result.structure) {
          result.structure = [];
        }
        result.structure.push(this.parseUses(parser));
      } else if (parser.peek()?.value === 'group') {
        if (!result.group) {
          result.group = [];
        }
        result.group.push(this.parseGroup(parser));
      }
    }

    return new StructureMapAtom(result);
  }

  parseUses(parser: Parser): StructureMapStructure {
    // 'uses' url structureAlias? 'as' modelMode
    // uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    parser.consume('uses');
    const url = parser.consume('String').value;
    parser.consume('as');
    const mode = parser.consume().value as 'source' | 'queried' | 'target' | 'produced';
    return { url, mode };
  }

  parseGroup(parser: Parser): StructureMapGroup {
    // 'group' identifier parameters extends? typeMode? rules
    // group tutorial(source src : TLeft, target tgt : TRight) {
    parser.consume('group');
    const name = parser.consume('Symbol').value;
    const input = this.parseParameters(parser);
    // TODO: extends
    // TODO: typeMode
    const typeMode = 'none';
    const rule = this.parseRules(parser);
    return { name, input, typeMode, rule };
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
    const mode = parser.consume().value as 'source' | 'target';
    const name = parser.consume('Symbol').value;
    parser.consume(':');
    const type = parser.consume('Symbol').value;
    return { mode, name, type };
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
      parser.consume('then');
      // dependent = parser.consumeAndParse();
      parser.consumeAndParse();
    }

    if (parser.peek()?.id === 'String') {
      result.name = parser.consume().value;
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
      parser.consume('as');
      result.variable = parser.consume().value;
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
      result.parameter = [
        {
          valueId: parser.consume().value,
        },
      ];
    }

    if (parser.peek()?.value === 'as') {
      parser.consume('as');
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
}

const fhirPathParserBuilder = initFhirPathParserBuilder().registerPrefix('map', new StructureMapParser());

/**
 * Parses a FHIR Mapping Language document into an AST.
 * @param input The FHIR Mapping Language document to parse.
 * @returns The AST representing the document.
 */
export function parseMappingLanguage(input: string): StructureMap {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();

  const atom = parser.consumeAndParse() as StructureMapAtom;
  return atom.structureMap;
}
