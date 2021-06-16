import { Filter, formatFamilyName, formatGivenName, formatHumanName, HumanName, Identifier, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../database';

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

/**
 * The IdentifierTable class is used to index and search "identifier" properties.
 * The common case for identifiers is a "system" and "value" key/value pair.
 * Each identifier is represented as a separate row in the "Identifier" table.
 */
export class IdentifierTable implements LookupTable {

  /**
   * Returns true if the search parameter is an "identifier" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return searchParam.code === 'identifier' && searchParam.type === 'token';
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (!('identifier' in resource)) {
      return;
    }

    const identifiers = resource.identifier;
    if (!identifiers || !Array.isArray(identifiers)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getIdentifiers(resourceId);

    if (!this.compareIdentifiers(identifiers, existing)) {
      const knex = getKnex();

      await knex('Identifier').where('resourceId', resourceId).delete().then(executeQuery);

      for (const identifier of identifiers) {
        await knex('Identifier').insert({
          id: randomUUID(),
          resourceId,
          system: identifier.system,
          value: identifier.value
        }).then(executeQuery);
      }
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param resourceType The FHIR resource type.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addSearchConditions(resourceType: string, selectQuery: Knex.QueryBuilder, filter: Filter): void {
    selectQuery.join('Identifier', resourceType + '.id', '=', 'Identifier.resourceId');
    selectQuery.where('Identifier.value', filter.value);
  }

  /**
   * Returns the existing list of indexed identifiers.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed identifiers.
   */
  private async getIdentifiers(resourceId: string): Promise<Identifier[]> {
    return getKnex()
      .select('system', 'value')
      .from('Identifier')
      .where('resourceId', resourceId)
      .then(result => result.map(row => ({ 'system': row[0], 'value': row[1] }) as Identifier));
  }

  /**
   * Determines if two lists of identifiers are equal.
   * @param incoming The incoming list of identifiers.
   * @param existing The existing list of identifiers.
   * @returns True if the lists are equivalent; false otherwise.
   */
  private compareIdentifiers(incoming: Identifier[], existing: Identifier[]): boolean {
    if (incoming.length !== existing.length) {
      return false;
    }

    incoming.sort((a, b) => (a.system as string).localeCompare(b.system as string));
    existing.sort((a, b) => (a.system as string).localeCompare(b.system as string));

    for (let i = 0; i < incoming.length; i++) {
      const incomingId = incoming[i];
      const existingId = existing[i];
      if (incomingId.system !== existingId.system || incomingId.value !== existingId.value) {
        return false;
      }
    }

    return true;
  }
}

/**
 * The HumanNameTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "HumanName" table.
 */
export class HumanNameTable implements LookupTable {
  private static readonly knownParams: Set<string> = new Set<string>([
    'individual-given',
    'individual-family',
    'Patient-name',
    'Person-name',
    'Practitioner-name',
    'RelatedPerson-name'
  ]);

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    if (!searchParam.id) {
      return false;
    }
    return HumanNameTable.knownParams.has(searchParam.id);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    if (resource.resourceType !== 'Patient' &&
      resource.resourceType !== 'Person' &&
      resource.resourceType !== 'Practitioner' &&
      resource.resourceType !== 'RelatedPerson') {
      return;
    }

    const names: HumanName[] | undefined = resource.name;
    if (!names || !Array.isArray(names)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getNames(resourceId);

    if (!this.compareNames(names, existing)) {
      const knex = getKnex();

      await knex('HumanName').where('resourceId', resourceId).delete().then(executeQuery);

      for (const name of names) {
        await knex('HumanName').insert({
          id: randomUUID(),
          resourceId,
          name: formatHumanName(name),
          given: formatGivenName(name),
          family: formatFamilyName(name)
        }).then(executeQuery);
      }
    }
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param resourceType The FHIR resource type.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addSearchConditions(resourceType: string, selectQuery: Knex.QueryBuilder, filter: Filter): void {
    selectQuery.join('HumanName', resourceType + '.id', '=', 'HumanName.resourceId');
    selectQuery.where('HumanName.' + filter.code, 'LIKE', '%' + filter.value + '%');
  }

  /**
   * Returns the existing list of indexed names.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed names.
   */
  private async getNames(resourceId: string): Promise<HumanName[]> {
    return getKnex()
      .select('given', 'family')
      .from('HumanName')
      .where('resourceId', resourceId)
      .then(result => result.map(row => ({
        given: row?.[0]?.split(' '),
        family: row[1]
      }) as HumanName));
  }

  /**
   * Determines if two lists of names are equal.
   * @param incoming The incoming list of names.
   * @param existing The existing list of names.
   * @returns True if the lists are equivalent; false otherwise.
   */
  private compareNames(incoming: Identifier[], existing: Identifier[]): boolean {
    if (incoming.length !== existing.length) {
      return false;
    }

    incoming.sort((a, b) => (a.system as string).localeCompare(b.system as string));
    existing.sort((a, b) => (a.system as string).localeCompare(b.system as string));

    for (let i = 0; i < incoming.length; i++) {
      const incomingId = incoming[i];
      const existingId = existing[i];
      if (incomingId.system !== existingId.system || incomingId.value !== existingId.value) {
        return false;
      }
    }

    return true;
  }
}
