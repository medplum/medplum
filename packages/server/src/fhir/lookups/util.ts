import { stringify } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';

/**
 * Compares two arrays of objects.
 * @param incoming The incoming array of elements.
 * @param existing The existing array of elements.
 * @returns True if the arrays are equal.  False if they are different.
 */
export function compareArrays(incoming: any[], existing: any[]): boolean {
  if (incoming.length !== existing.length) {
    return false;
  }

  for (let i = 0; i < incoming.length; i++) {
    if (stringify(incoming[i]) !== stringify(existing[i])) {
      return false;
    }
  }

  return true;
}

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
 *
 * @param inputParam The original reference search parameter.
 * @returns The derived "identifier" search parameter.
 */
export function deriveIdentifierSearchParameter(inputParam: SearchParameter): SearchParameter {
  return {
    resourceType: 'SearchParameter',
    code: inputParam.code + ':identifier',
    base: inputParam.base,
    type: 'token',
    expression: `(${inputParam.expression}).identifier`,
  };
}
