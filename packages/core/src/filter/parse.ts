import { Parser } from '../fhirlexer';
import { initFhirPathParserBuilder } from '../fhirpath';
import { tokenize } from './tokenize';
import { FhirFilterComparison, FhirFilterConnective, FhirFilterExpression, FhirFilterNegation } from './types';

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
        this.parser.consume('Symbol').value,
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
 * @param input The FHIR _filter parameter expression.
 * @returns The AST representing the filters.
 */
export function parseFilterParameter(input: string): FhirFilterExpression {
  const parser = fhirPathParserBuilder.construct(tokenize(input));
  parser.removeComments();
  return new FilterParameterParser(parser).parse();
}
