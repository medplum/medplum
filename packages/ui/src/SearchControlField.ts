import { getSearchParameterDetails, IndexedStructureDefinition, SearchRequest } from '@medplum/core';
import { ElementDefinition, SearchParameter } from '@medplum/fhirtypes';

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
  readonly searchParam?: SearchParameter;
}

/**
 * Returns the collection of field definitions for the search request.
 * @param typeSchema The schema for the resource type
 * @param search The search request definition.
 * @returns An array of field definitions.
 */
export function getFieldDefinitions(schema: IndexedStructureDefinition, search: SearchRequest): SearchControlField[] {
  const resourceType = search.resourceType;
  const fields = [] as SearchControlField[];

  for (const name of search.fields || ['id', '_lastUpdated']) {
    fields.push(getFieldDefinition(schema, resourceType, name));
  }
  return fields;
}

/**
 * Return the field definition for a given field name.
 * Field names can be either property names or search parameter codes.
 * @param typeSchema The schema for the resource type
 * @param resourceType The resource type.
 * @param name The search field name (either property name or search parameter code).
 * @returns The field definition.
 */
function getFieldDefinition(
  schema: IndexedStructureDefinition,
  resourceType: string,
  name: string
): SearchControlField {
  if (name === '_lastUpdated') {
    return {
      name: '_lastUpdated',
      searchParam: {
        resourceType: 'SearchParameter',
        base: ['Resource'],
        code: '_lastUpdated',
        name: '_lastUpdated',
        type: 'date',
        expression: 'Resource.meta.lastUpdated',
      },
    };
  }

  if (name === 'meta.versionId') {
    return {
      name: 'meta.versionId',
      searchParam: {
        resourceType: 'SearchParameter',
        base: ['Resource'],
        code: '_versionId',
        name: '_versionId',
        type: 'token',
        expression: 'Resource.meta.versionId',
      },
    };
  }

  const typeSchema = schema.types[resourceType];

  // Get the element definition
  // If there is an exact match, use that
  let elementDefinition: ElementDefinition | undefined = typeSchema.properties[name];

  // Get the search parameter
  // If there is an exact match, use that
  let searchParam: SearchParameter | undefined = typeSchema.searchParams?.[name];

  if (elementDefinition && !searchParam && typeSchema.searchParams) {
    // Try to find a search parameter based on the property
    // For example, name="birthDate", try to find searchParam="birthdate"
    // const path = `${resourceType}.${name}`;
    // searchParam = Object.values(typeSchema.searchParams).find((p) => p.expression?.includes(path));
    // searchParam = getSearchParamForElement(typeSchema, resourceType, name);
    const path = `${resourceType}.${name}`;
    searchParam = Object.values(typeSchema.searchParams).find((p) => p.expression?.includes(path));
  }

  if (!elementDefinition && searchParam?.expression) {
    // Try to find an element definition based on the search parameter
    // For example, name="email", try to find elementDefinition="telecom"
    const details = getSearchParameterDetails(schema, resourceType, searchParam);
    elementDefinition = details.elementDefinition;
  }

  return { name, elementDefinition, searchParam };
}
