import { formatAddress } from '@medplum/core';
import { Address, Resource, SearchParameter } from '@medplum/fhirtypes';
import { PoolClient } from 'pg';
import { LookupTable } from './lookuptable';

/**
 * The AddressTable class is used to index and search Address properties.
 * Each Address is represented as a separate row in the "Address" table.
 */
export class AddressTable extends LookupTable {
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
   * Returns the table name.
   * @returns The table name.
   */
  getTableName(): string {
    return 'Address';
  }

  /**
   * Returns the column name for the address.
   *
   *   Input              | Output
   *  --------------------+-----------
   *   address            | address
   *   address-city       | city
   *   address-country    | country
   *   address-postalcode | postalCode
   *   address-state      | state
   *   addrses-use        | use
   * @param code - The search parameter code.
   * @returns The column name.
   */
  getColumnName(code: string): string {
    if (code === 'address') {
      return 'address';
    }
    if (code === 'address-postalcode') {
      return 'postalCode';
    }
    return code.replace('address-', '');
  }

  /**
   * Returns true if the search parameter is an Address parameter.
   * @param searchParam - The search parameter.
   * @returns True if the search parameter is an Address parameter.
   */
  isIndexed(searchParam: SearchParameter): boolean {
    return AddressTable.knownParams.has(searchParam.id as string);
  }

  /**
   * Indexes a resource Address values.
   * Attempts to reuse existing Addresses if they are correct.
   * @param client - The database client.
   * @param resource - The resource to index.
   * @param create - True if the resource should be created (vs updated).
   * @returns Promise on completion.
   */
  async indexResource(client: PoolClient, resource: Resource, create: boolean): Promise<void> {
    if (!create) {
      await this.deleteValuesForResource(client, resource);
    }

    const addresses = this.getIncomingAddresses(resource);
    if (!addresses || !Array.isArray(addresses)) {
      return;
    }

    const resourceType = resource.resourceType;
    const resourceId = resource.id as string;
    const values = addresses.map((address) => ({
      resourceId,
      address: formatAddress(address),
      city: address.city?.trim(),
      country: address.country?.trim(),
      postalCode: address.postalCode?.trim(),
      state: address.state?.trim(),
      use: address.use?.trim(),
    }));

    await this.insertValuesForResource(client, resourceType, values);
  }

  private getIncomingAddresses(resource: Resource): Address[] | undefined {
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
}
