import { Atom, Parser, PrefixParselet } from '../fhirlexer';
import { initFhirPathParserBuilder } from '../fhirpath';
import {
  GroupAtom,
  MapAtom,
  ParameterAtom,
  RuleAtom,
  RuleDependentAtom,
  RuleSourceAtom,
  RuleTargetAtom,
  UsesAtom,
} from './atoms';
import { tokenize } from './tokenize';

class MapParser implements PrefixParselet {
  parse(parser: Parser): MapAtom {
    // 'map' url '=' identifier
    // map "http://hl7.org/fhir/StructureMap/tutorial" = tutorial
    const url = parser.consume('String');
    parser.consume('=');
    const identifier = parser.consume('Symbol');
    return new MapAtom(url.value, identifier.value);
  }
}

class UsesParser implements PrefixParselet {
  parse(parser: Parser): UsesAtom {
    // 'uses' url structureAlias? 'as' modelMode
    // uses "http://hl7.org/fhir/StructureDefinition/tutorial-left" as source
    const url = parser.consume('String');
    parser.consume('as');
    const modelMode = parser.consume();
    return new UsesAtom(url.value, modelMode.value);
  }
}

class GroupParser implements PrefixParselet {
  parse(parser: Parser): GroupAtom {
    // 'group' identifier parameters extends? typeMode? rules
    // group tutorial(source src : TLeft, target tgt : TRight) {
    const identifier = parser.consume('Symbol');
    const parameters = this.parseParameters(parser);
    // TODO: extends
    // TODO: typeMode
    const rules = this.parseRules(parser);
    return new GroupAtom(identifier.value, parameters, rules);
  }

  parseParameters(parser: Parser): ParameterAtom[] {
    const parameters: ParameterAtom[] = [];
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

  parseParameter(parser: Parser): ParameterAtom {
    // inputMode identifier type?
    // ':' identifier
    // source src : TLeft
    const inputMode = parser.consume();
    const identifier = parser.consume('Symbol');
    parser.consume(':');
    const type = parser.consume('Symbol');
    return new ParameterAtom(inputMode.value, identifier.value, type.value);
  }

  parseRules(parser: Parser): RuleAtom[] {
    const rules = [];
    parser.consume('{');
    while (parser.hasMore() && parser.peek()?.value !== '}') {
      rules.push(this.parseRule(parser));
    }
    parser.consume('}');
    return rules;
  }

  parseRule(parser: Parser): RuleAtom {
    const sources = this.parseRuleSources(parser);

    let targets = undefined;
    if (parser.peek()?.value === '->') {
      parser.consume('->');
      targets = this.parseRuleTargets(parser);
    }

    let dependent = undefined;
    if (parser.peek()?.value === 'then') {
      parser.consume('then');
      dependent = parser.consumeAndParse();
    }

    let name = undefined;
    if (parser.peek()?.id === 'String') {
      name = parser.consume();
    }

    parser.consume(';');
    return new RuleAtom(sources, targets, dependent as RuleDependentAtom | undefined, name?.value);
  }

  parseRuleSources(parser: Parser): RuleSourceAtom[] {
    const sources = [this.parseRuleSource(parser)];
    while (parser.hasMore() && parser.peek()?.value === ',') {
      parser.consume(',');
      sources.push(this.parseRuleSource(parser));
    }
    return sources;
  }

  parseRuleSource(parser: Parser): RuleSourceAtom {
    const context = this.parseRuleContext(parser);

    let sourceType = undefined;
    if (parser.hasMore() && parser.peek()?.value === ':') {
      parser.consume(':');
      sourceType = parser.consume();
    }

    let sourceDefault = undefined;
    if (parser.hasMore() && parser.peek()?.value === 'default') {
      parser.consume('default');
      sourceDefault = parser.consumeAndParse();
    }

    let sourceListMode = undefined;
    if (
      parser.peek()?.value === 'first' ||
      parser.peek()?.value === 'not_first' ||
      parser.peek()?.value === 'last' ||
      parser.peek()?.value === 'not_last' ||
      parser.peek()?.value === 'only_one'
    ) {
      sourceListMode = parser.consume();
    }

    let alias = undefined;
    if (parser.peek()?.value === 'as') {
      parser.consume('as');
      alias = parser.consume();
    }

    return new RuleSourceAtom(
      context,
      sourceType?.value,
      sourceDefault,
      sourceListMode?.value,
      alias?.value,
      undefined,
      undefined,
      undefined
    );
  }

  parseRuleTargets(parser: Parser): RuleTargetAtom[] {
    const targets = [this.parseRuleTarget(parser)];
    while (parser.hasMore() && parser.peek()?.value === ',') {
      parser.consume(',');
      targets.push(this.parseRuleTarget(parser));
    }
    return targets;
  }

  parseRuleTarget(parser: Parser): RuleTargetAtom {
    const context = this.parseRuleContext(parser);

    let transform = undefined;
    if (parser.peek()?.value === '=') {
      parser.consume('=');
      transform = this.parseTransform(parser);
    }

    let alias = undefined;
    if (parser.peek()?.value === 'as') {
      parser.consume('as');
      alias = parser.consume();
    }

    let targetListMode = undefined;
    if (
      parser.peek()?.value === 'first' ||
      parser.peek()?.value === 'share' ||
      parser.peek()?.value === 'last' ||
      parser.peek()?.value === 'collate'
    ) {
      targetListMode = parser.consume();
    }

    return new RuleTargetAtom(context, transform, alias?.value, targetListMode?.value);
  }

  parseRuleContext(parser: Parser): string {
    let identifier = parser.consume().value;
    while (parser.peek()?.value === '.') {
      parser.consume('.');
      identifier += '.' + parser.consume().value;
    }
    return identifier;
  }

  parseTransform(parser: Parser): Atom {
    return parser.consumeAndParse();
  }
}

const fhirPathParserBuilder = initFhirPathParserBuilder()
  .registerPrefix('map', new MapParser())
  .registerPrefix('uses', new UsesParser())
  .registerPrefix('group', new GroupParser());

/**
 * Parses a FHIR Mapping Language document into an AST.
 * @param input The FHIR Mapping Language document to parse.
 * @returns The AST representing the document.
 */
export function parseMappingLanguage(input: string): Atom[] {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();
  const atoms = [];
  while (parser.hasMore()) {
    atoms.push(parser.consumeAndParse());
  }
  return atoms;
}
