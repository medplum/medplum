import { deriveIdentifierSearchParameter, getSearchParameters } from '@medplum/core';
import { SearchParameter } from '@medplum/fhirtypes';

function getDerivedSearchParameters(searchParams: SearchParameter[]): SearchParameter[] {
  const result: SearchParameter[] = [];
  for (const searchParameter of searchParams) {
    if (searchParameter.type === 'reference') {
      result.push(deriveIdentifierSearchParameter(searchParameter));
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
  const derivedParams = getDerivedSearchParameters(standardParams);
  return [...standardParams, ...derivedParams];
}
