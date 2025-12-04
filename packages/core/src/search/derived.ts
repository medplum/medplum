// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchParameter } from '@medplum/fhirtypes';
import { DotAtom, FhirPathAtom, SymbolAtom } from '../fhirpath/atoms';

/**
 * Derives an "identifier" search parameter from a reference search parameter.
 *
 * FHIR references can have an "identifier" property.
 *
 * Any FHIR reference search parameter can be used to search for resources with an identifier.
 *
 * However, the FHIR specification does not define an "identifier" search parameter for every resource type.
 *
 * This function derives an "identifier" search parameter from a reference search parameter.
 * @param inputParam - The original reference search parameter.
 * @returns The derived "identifier" search parameter.
 */
export function deriveIdentifierSearchParameter(inputParam: SearchParameter): SearchParameter {
  return {
    resourceType: 'SearchParameter',
    code: inputParam.code + ':identifier',
    base: inputParam.base,
    type: 'token',
    expression: `(${inputParam.expression}).identifier`,
  } as SearchParameter;
}

export function getInnerDerivedIdentifierExpression(expression: string): string | undefined {
  return expression.match(/^\((.+)\)\.identifier$/)?.[1];
}

export function getParsedDerivedIdentifierExpression(originalExpression: string, atom: FhirPathAtom): FhirPathAtom {
  return new FhirPathAtom(originalExpression, new DotAtom(atom, new SymbolAtom('identifier')));
}
