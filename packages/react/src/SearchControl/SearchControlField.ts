import { getSearchParameterDetails, globalSchema, SearchRequest } from '@medplum/core';
import { ElementDefinition, ResourceType, SearchParameter } from '@medplum/fhirtypes';

/**
 * The SearchControlField type describes a field in the search control.
 *
 * In a SearchRequest, a field is a simple string. Strings can be one of the following:
 * 1) Simple property names, which refer to ElementDefinition objects
 * 2) Search parameter names, which refer to SearchParameter resources
 *
 * Consider a few examples of how this becomes complicated.
 *
 * "name" (easy)
 *  - element definition path="Patient.name"
 *  - search parameter code="name"
 *
 * "birthDate" (medium)
 *  - refers to the element definition path="Patient.birthDate"
 *  - refers to the search parameter code="birthdate" (note the capitalization)
 *
 * "email" (hard)
 *  - refers to the search parameter code="email"
 *  - refers to the element definition path="Patient.telecom"
 *
 * In the last case, we start with the search parameter, and walk backwards to the
 * element definition in order to get type details for rendering.
 *
 * Overall, we want columns, fields, properties, and search parameters to feel seamless,
 * so we try our darndest to make this work.
 */
export interface SearchControlField {
  readonly name: string;
  readonly elementDefinition?: ElementDefinition;
  readonly searchParams?: SearchParameter[];
}

/**
 * Returns the collection of field definitions for the search request.
 * @param search The search request definition.
 * @returns An array of field definitions.
 */
export function getFieldDefinitions(search: SearchRequest): SearchControlField[] {
  const resourceType = search.resourceType;
  const fields = [] as SearchControlField[];

  for (const name of search.fields || ['id', '_lastUpdated']) {
    fields.push(getFieldDefinition(resourceType, name));
  }
  return fields;
}

/**
 * Return the field definition for a given field name.
 * Field names can be either property names or search parameter codes.
 * @param resourceType The resource type.
 * @param name The search field name (either property name or search parameter code).
 * @returns The field definition.
 */
function getFieldDefinition(resourceType: string, name: string): SearchControlField {
  if (name === '_lastUpdated') {
    return {
      name: '_lastUpdated',
      searchParams: [
        {
          resourceType: 'SearchParameter',
          base: ['Resource' as ResourceType],
          code: '_lastUpdated',
          name: '_lastUpdated',
          type: 'date',
          expression: 'Resource.meta.lastUpdated',
        },
      ],
    };
  }

  if (name === 'meta.versionId') {
    return {
      name: 'meta.versionId',
      searchParams: [
        {
          resourceType: 'SearchParameter',
          base: ['Resource' as ResourceType],
          code: '_versionId',
          name: '_versionId',
          type: 'token',
          expression: 'Resource.meta.versionId',
        },
      ],
    };
  }

  const typeSchema = globalSchema.types[resourceType];
  const exactElementDefinition: ElementDefinition | undefined = typeSchema.properties[name];
  const exactSearchParam: SearchParameter | undefined = typeSchema.searchParams?.[name.toLowerCase()];

  // Best case: Exact match of element definition or search parameter.
  // Examples: ServiceRequest.subject, Patient.name, Patient.birthDate
  // In this case, we only show the one search parameter.
  if (exactElementDefinition && exactSearchParam) {
    return { name, elementDefinition: exactElementDefinition, searchParams: [exactSearchParam] };
  }

  // Next best case: Exact match of element definition
  // Examples: Observation.value
  // In this case, there could be zero or more search parameters that are a function of the element definition.
  // So search for those search parameters.
  if (exactElementDefinition) {
    let searchParams: SearchParameter[] | undefined = undefined;
    if (typeSchema.searchParams) {
      const path = `${resourceType}.${name.replaceAll('[x]', '')}`;
      searchParams = Object.values(typeSchema.searchParams).filter((p) => p.expression?.includes(path));
      if (searchParams.length === 0) {
        searchParams = undefined;
      }
    }
    return { name, elementDefinition: exactElementDefinition, searchParams };
  }

  // Search parameter case: Exact match of search parameter
  // Examples: Observation.value-quantity, Patient.email
  // Here we have a search parameter, but no element definition.
  // Observation.value-quantity is a search parameter for the Observation.value element.
  // Patient.email is a search parameter for the Patient.telecom element.
  // So we need to walk backwards to find the element definition.
  if (exactSearchParam) {
    const details = getSearchParameterDetails(resourceType, exactSearchParam);
    return { name, elementDefinition: details.elementDefinition, searchParams: [exactSearchParam] };
  }

  // Worst case: no element definition and no search parameter.
  // This is probably a malformed URL that includes an unknown field.
  // We will render the column header, but all cells will be empty.
  return { name };
}
