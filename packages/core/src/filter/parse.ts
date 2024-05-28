import { Parser } from '../fhirlexer/parse';
import { initFhirPathParserBuilder } from '../fhirpath/parse';
import { OperationOutcomeError, badRequest } from '../outcomes';
import { Operator } from '../search/search';
import { tokenize } from './tokenize';
import { FhirFilterComparison, FhirFilterConnective, FhirFilterExpression, FhirFilterNegation } from './types';

/**
 * The operatorMap maps FHIR _filter operators to Medplum search operators.
 * See _filter operators: https://www.hl7.org/fhir/search_filter.html#ops
 */
const operatorMap: Record<string, Operator | undefined> = {
  // eq - an item in the set has an equal value
  eq: Operator.EQUALS,
  // ne - An item in the set has an unequal value
  ne: Operator.NOT_EQUALS,
  // co - An item in the set contains this value
  co: Operator.CONTAINS,
  // sw - An item in the set starts with this value
  sw: undefined,
  // ew - An item in the set ends with this value
  ew: undefined,
  // gt / lt / ge / le - A value in the set is (greater than, less than, greater or equal, less or equal) the given value
  gt: Operator.GREATER_THAN,
  lt: Operator.LESS_THAN,
  ge: Operator.GREATER_THAN_OR_EQUALS,
  le: Operator.LESS_THAN_OR_EQUALS,
  // ap - A value in the set is approximately the same as this value.
  // Note that the recommended value for the approximation is 10% of the stated value (or for a date, 10% of the gap between now and the date), but systems may choose other values where appropriate
  ap: Operator.APPROXIMATELY,
  // sa - The value starts after the specified value
  sa: Operator.STARTS_AFTER,
  // eb - The value ends before the specified value
  eb: Operator.ENDS_BEFORE,
  // pr - The set is empty or not (value is false or true)
  pr: Operator.PRESENT,
  // po - True if a (implied) date period in the set overlaps with the implied period in the value
  po: undefined,
  // ss - True if the value subsumes a concept in the set
  ss: undefined,
  // sb - True if the value is subsumed by a concept in the set
  sb: undefined,
  // in - True if one of the concepts is in the nominated value set by URI, either a relative, literal or logical vs
  in: Operator.IN,
  // ni - True if none of the concepts are in the nominated value set by URI, either a relative, literal or logical vs
  ni: Operator.NOT_IN,
  // re - True if one of the references in set points to the given URL
  re: Operator.EQUALS,
  // identifier - True if the identifier is in the identifier set (Medplum extension)
  identifier: Operator.IDENTIFIER,
};

function getOperator(value: string): Operator {
  const operator = operatorMap[value];
  if (!operator) {
    throw new OperationOutcomeError(badRequest('Invalid operator: ' + value));
  }
  return operator;
}

class FilterParameterParser {
  constructor(readonly parser: Parser) {}

  parse(): FhirFilterExpression {
    let result: FhirFilterExpression;

    if (this.parser.peek()?.value === '(') {
      this.parser.consume('(');
      result = this.parse();
      this.parser.consume(')');
    } else if (this.parser.peek()?.value === 'not') {
      this.parser.consume('Symbol', 'not');
      this.parser.consume('(');
      result = new FhirFilterNegation(this.parse());
      this.parser.consume(')');
    } else {
      result = new FhirFilterComparison(
        this.parser.consume('Symbol').value,
        getOperator(this.parser.consume('Symbol').value),
        this.parser.consume().value
      );
    }

    const next = this.parser.peek()?.value;
    if (next === 'and' || next === 'or') {
      this.parser.consume('Symbol', next);
      return new FhirFilterConnective(next, result, this.parse());
    }

    return result;
  }
}

const fhirPathParserBuilder = initFhirPathParserBuilder();

/**
 * Parses a FHIR _filter parameter expression into an AST.
 * @param input - The FHIR _filter parameter expression.
 * @returns The AST representing the filters.
 */
export function parseFilterParameter(input: string): FhirFilterExpression {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();
  return new FilterParameterParser(parser).parse();
}
