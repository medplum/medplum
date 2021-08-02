import { Address, Filter, formatAddress, Resource, SearchParameter } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Knex } from 'knex';
import { executeQuery, getKnex } from '../../database';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The AddressTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "Address" table.
 */
export class AddressTable implements LookupTable {
  private static readonly knownParams: Set<string> = new Set<string>([
    'individual-address',
    'individual-address-city',
    'individual-address-country',
    'individual-address-postalcode',
    'individual-address-state',
    'individual-address-use',
    'InsurancePlan-address',
    'InsurancePlan-address-city',
    'InsurancePlan-address-country',
    'InsurancePlan-address-postalcode',
    'InsurancePlan-address-state',
    'InsurancePlan-address-use',
    'Location-address',
    'Location-address-city',
    'Location-address-country',
    'Location-address-postalcode',
    'Location-address-state',
    'Location-address-use',
    'Organization-address',
    'Organization-address-city',
    'Organization-address-country',
    'Organization-address-postalcode',
    'Organization-address-state',
    'Organization-address-use',
  ]);

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return AddressTable.knownParams.has(searchParam.id as string);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    const addresses = this.getIncomingAddresses(resource);
    if (!addresses || !Array.isArray(addresses)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.getExistingAddresses(resourceId);

    if (!compareArrays(addresses, existing)) {
      const knex = getKnex();

      if (existing.length > 0) {
        await knex('Address').where('resourceId', resourceId).delete().then(executeQuery);
      }

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        await knex('Address').insert({
          id: randomUUID(),
          resourceId,
          index: i,
          content: JSON.stringify(address),
          address: formatAddress(address),
          city: address.city,
          country: address.country,
          postalCode: address.postalCode,
          state: address.state,
          use: address.use
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
    selectQuery.join('Address', resourceType + '.id', '=', 'Address.resourceId');

    const columnName = filter.code === 'address' ? 'address' : filter.code.replace('address-', '');
    selectQuery.where('Address.' + columnName, 'LIKE', '%' + filter.value + '%');
  }

  private getIncomingAddresses(resource: Resource): Address[] | undefined {
    if (resource.resourceType === 'Patient' ||
      resource.resourceType === 'Person' ||
      resource.resourceType === 'Practitioner' ||
      resource.resourceType === 'RelatedPerson') {
      return resource.address;
    }

    if (resource.resourceType === 'InsurancePlan') {
      return resource.contact?.map(contact => contact.address)
        .filter(address => !!address) as Address[] | undefined;
    }

    if (resource.resourceType === 'Location') {
      return resource.address ? [resource.address] : undefined;
    }

    if (resource.resourceType === 'Organization') {
      return resource.address;
    }

    // This resource does not have any address properties
    return undefined;
  }

  /**
   * Returns the existing list of indexed addresses.
   * @param resourceId The FHIR resource ID.
   * @returns Promise for the list of indexed addresses.
   */
  private async getExistingAddresses(resourceId: string): Promise<Address[]> {
    return getKnex()
      .select('content')
      .from('Address')
      .where('resourceId', resourceId)
      .orderBy('index')
      .then(result => result.map(row => JSON.parse(row.content) as Address));
  }
}
