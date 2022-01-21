import { Filter, formatAddress, SortRule, stringify } from '@medplum/core';
import { Address, Resource, SearchParameter } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { getClient } from '../../database';
import { DeleteQuery, InsertQuery, Operator, SelectQuery } from '../sql';
import { LookupTable } from './lookuptable';
import { compareArrays } from './util';

/**
 * The AddressTable class is used to index and search "name" properties on "Person" resources.
 * Each name is represented as a separate row in the "Address" table.
 */
export class AddressTable implements LookupTable {
  static readonly #knownParams: Set<string> = new Set<string>([
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
   * Returns the table name.
   * @returns The table name.
   */
  getName(): string {
    return 'Address';
  }

  /**
   * Returns true if the search parameter is an "" parameter.
   * @param searchParam The search parameter.
   * @returns True if the search parameter is an "identifier" parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return AddressTable.#knownParams.has(searchParam.id as string);
  }

  /**
   * Deletes a resource from the index.
   * @param resource The resource to delete.
   */
  async deleteResource(resource: Resource): Promise<void> {
    const resourceId = resource.id as string;
    const client = getClient();
    await new DeleteQuery('Address').where('resourceId', Operator.EQUALS, resourceId).execute(client);
  }

  /**
   * Indexes a resource identifier values.
   * Attempts to reuse existing identifiers if they are correct.
   * @param resource The resource to index.
   * @returns Promise on completion.
   */
  async indexResource(resource: Resource): Promise<void> {
    const addresses = this.#getIncomingAddresses(resource);
    if (!addresses || !Array.isArray(addresses)) {
      return;
    }

    const resourceId = resource.id as string;
    const existing = await this.#getExistingAddresses(resourceId);

    if (!compareArrays(addresses, existing)) {
      const client = getClient();

      if (existing.length > 0) {
        await this.deleteResource(resource);
      }

      for (let i = 0; i < addresses.length; i++) {
        const address = addresses[i];
        await new InsertQuery('Address', {
          id: randomUUID(),
          resourceId,
          index: i,
          content: stringify(address),
          address: formatAddress(address),
          city: address.city,
          country: address.country,
          postalCode: address.postalCode,
          state: address.state,
          use: address.use,
        }).execute(client);
      }
    }
  }

  /**
   * Adds "join" expression to the select query builder.
   * @param selectQuery The select query builder.
   */
  addJoin(selectQuery: SelectQuery): void {
    selectQuery.join('Address', 'id', 'resourceId');
  }

  /**
   * Adds "where" conditions to the select query builder.
   * @param selectQuery The select query builder.
   * @param filter The search filter details.
   */
  addWhere(selectQuery: SelectQuery, filter: Filter): void {
    selectQuery.where(
      { tableName: 'Address', columnName: this.#getColumnName(filter.code) },
      Operator.LIKE,
      '%' + filter.value + '%'
    );
  }

  /**
   * Adds "order by" clause to the select query builder.
   * @param selectQuery The select query builder.
   * @param sortRule The sort rule details.
   */
  addOrderBy(selectQuery: SelectQuery, sortRule: SortRule): void {
    selectQuery.orderBy({ tableName: 'Address', columnName: this.#getColumnName(sortRule.code) }, sortRule.descending);
  }

  /**
   * Returns the column name for the address.
   *
   *   Input              | Output
   *  --------------------+-----------
   *   address            | address
   *   address-city       | city
   *   address-country    | country
   *   address-postalcode | postalcode
   *   address-state      | state
   *   addrses-use        | use
   *
   * @param code The search parameter code.
   * @returns The column name.
   */
  #getColumnName(code: string): string {
    return code === 'address' ? 'address' : code.replace('address-', '');
  }

  #getIncomingAddresses(resource: Resource): Address[] | undefined {
    if (
      resource.resourceType === 'Patient' ||
      resource.resourceType === 'Person' ||
      resource.resourceType === 'Practitioner' ||
      resource.resourceType === 'RelatedPerson'
    ) {
      return resource.address;
    }

    if (resource.resourceType === 'InsurancePlan') {
      return resource.contact?.map((contact) => contact.address).filter((address) => !!address) as
        | Address[]
        | undefined;
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
  async #getExistingAddresses(resourceId: string): Promise<Address[]> {
    return new SelectQuery('Address')
      .column('content')
      .where('resourceId', Operator.EQUALS, resourceId)
      .orderBy('index')
      .execute(getClient())
      .then((result) => result.map((row) => JSON.parse(row.content) as Address));
  }
}
