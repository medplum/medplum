// See: https://hl7.org/fhir/search_filter.html

import { Operator } from '../search/search';

/**
 * The FhirFilterExpression type is the base type of all filter expressions.
 */
export type FhirFilterExpression = FhirFilterComparison | FhirFilterNegation | FhirFilterConnective;

/**
 * The FhirFilterComparison class represents a comparison expression.
 */
export class FhirFilterComparison {
  constructor(
    readonly path: string,
    readonly operator: Operator,
    readonly value: string
  ) {}
}

/**
 * The FhirFilterNegation class represents a negation expression.
 * It contains a single child expression.
 */
export class FhirFilterNegation {
  constructor(readonly child: FhirFilterExpression) {}
}

/**
 * The FhirFilterConnective class represents a connective expression.
 * It contains a list of child expressions.
 */
export class FhirFilterConnective {
  constructor(
    readonly keyword: 'and' | 'or',
    readonly left: FhirFilterExpression,
    readonly right: FhirFilterExpression
  ) {}
}
