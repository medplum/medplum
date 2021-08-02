import { Filter, Resource, SearchParameter } from '@medplum/core';
import { Knex } from 'knex';

/**
 * The LookupTable interface is used for search parameters that are indexed in separate tables.
 * This is necessary for array properties with specific structure.
 * Common examples include:
 *   1) Identifiers - arbitrary key/value pairs on many different resource types
 *   2) Human Names - structured names on Patients, Practitioners, and other person resource types
 *   3) Contact Points - email addresses and phone numbers
 */
export interface LookupTable {

  /**
   * Determines if the search parameter is indexed by this index table.
   * @param searchParam The search parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean;

  /**
   * Indexes the resource in the lookup table.
   * @param resource The resource to index.
   */
  indexResource(resource: Resource): Promise<void>;

  /**
   * Adds "where" conditions to the select query builder.
   * @param resourceType The FHIR resource type.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addSearchConditions(resourceType: string, selectQuery: Knex.QueryBuilder, filter: Filter): void;
}
