import { getSearchParameters } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';

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

function getDerivedSearchParameters(resourceType: string): SearchParameter[] {
  const result: SearchParameter[] = [];
  const searchParameters = getSearchParameters(resourceType);
  if (searchParameters) {
    for (const searchParameter of Object.values(searchParameters)) {
      if (searchParameter.type === 'reference') {
        result.push(deriveIdentifierSearchParameter(searchParameter));
      }
    }
  }
  return result;
}

/**
 * Returns all search parameters for a resource type, including both standard and derived parameters.
 * @param resourceType - The FHIR resource type.
 * @returns Array of SearchParameters including both standard and derived parameters.
 */
export function getStandardAndDerivedSearchParameters(resourceType: string): SearchParameter[] {
  const standardParams = Object.values(getSearchParameters(resourceType) ?? {});
  const derivedParams = getDerivedSearchParameters(resourceType);
  return [...standardParams, ...derivedParams];
}
