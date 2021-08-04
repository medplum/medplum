import { Filter, Resource, SearchParameter, SortRule } from '@medplum/core';
import { SelectQuery } from '../sql';

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
   * Returns the unique name of the lookup table.
   * @returns The unique name of the lookup table.
   */
  getName(): string;

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
   * Adds "join" expression to the select query builder.
   * @param selectQuery The select query builder.
   * @param resourceType The primary FHIR resource type.
   */
  addJoin(selectQuery: SelectQuery, resourceType: string): void;

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void;

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void;
}
