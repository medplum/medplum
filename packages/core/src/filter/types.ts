// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operator } from '../search/search';

// See: https://hl7.org/fhir/search_filter.html

/**
 * The FhirFilterExpression type is the base type of all filter expressions.
 */
export type FhirFilterExpression = FhirFilterComparison | FhirFilterNegation | FhirFilterConnective;

/**
 * The FhirFilterComparison class represents a comparison expression.
 */
export class FhirFilterComparison {
  readonly path: string;
  readonly operator: Operator;
  readonly value: string;

  constructor(path: string, operator: Operator, value: string) {
    this.path = path;
    this.operator = operator;
    this.value = value;
  }
}

/**
 * The FhirFilterNegation class represents a negation expression.
 * It contains a single child expression.
 */
export class FhirFilterNegation {
  readonly child: FhirFilterExpression;

  constructor(child: FhirFilterExpression) {
    this.child = child;
  }
}

/**
 * The FhirFilterConnective class represents a connective expression.
 * It contains a list of child expressions.
 */
export class FhirFilterConnective {
  readonly keyword: 'and' | 'or';
  readonly left: FhirFilterExpression;
  readonly right: FhirFilterExpression;

  constructor(keyword: 'and' | 'or', left: FhirFilterExpression, right: FhirFilterExpression) {
    this.keyword = keyword;
    this.left = left;
    this.right = right;
  }
}
