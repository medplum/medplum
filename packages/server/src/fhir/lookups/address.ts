import { formatAddress } from '@medplum/core';
import { Address, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { Column, DeleteQuery } from '../sql';
import { LookupTable } from './lookuptable';

/**
 * The AddressTable class is used to index and search Address properties.
 * Each Address is represented as a separate row in the "Address" table.
 */
export class AddressTable extends LookupTable {
  private static readonly resourceTypes = [
    'Patient',
    'Person',
    'Practitioner',
    'RelatedPerson',
    'InsurancePlan',
    'Location',
    'Organization',
  ] as const;

  private static readonly resourceTypeSet = new Set(this.resourceTypes);

  private static hasAddress(resourceType: ResourceType): resourceType is (typeof AddressTable.resourceTypes)[number] {
    return AddressTable.resourceTypeSet.has(resourceType as any);
  }

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
    if (!AddressTable.hasAddress(resource.resourceType)) {
      return;
    }

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
    if (!AddressTable.hasAddress(resource.resourceType)) {
      return undefined;
    }

    switch (resource.resourceType) {
      case 'Patient':
      case 'Person':
      case 'Practitioner':
      case 'RelatedPerson':
      case 'Organization':
        return resource.address;
      case 'InsurancePlan':
        return resource.contact?.map((contact) => contact.address).filter((address) => !!address);
      case 'Location':
        return resource.address ? [resource.address] : undefined;
      default:
        resource.resourceType satisfies never;
        return undefined;
    }
  }

  /**
   * Deletes the resource from the lookup table.
   * @param client - The database client.
   * @param resource - The resource to delete.
   */
  async deleteValuesForResource(client: Pool | PoolClient, resource: Resource): Promise<void> {
    if (!AddressTable.hasAddress(resource.resourceType)) {
      return;
    }

    const tableName = this.getTableName();
    const resourceId = resource.id as string;
    await new DeleteQuery(tableName).where('resourceId', '=', resourceId).execute(client);
  }

  /**
   * Purges resources of the specified type that were last updated before the specified date.
   * This is only available to the system and super admin accounts.
   * @param client - The database client.
   * @param resourceType - The FHIR resource type.
   * @param before - The date before which resources should be purged.
   */
  async purgeValuesBefore(client: Pool | PoolClient, resourceType: ResourceType, before: string): Promise<void> {
    if (!AddressTable.hasAddress(resourceType)) {
      return;
    }

    const lookupTableName = this.getTableName();
    await new DeleteQuery(lookupTableName)
      .using(resourceType)
      .where(new Column(lookupTableName, 'resourceId'), '=', new Column(resourceType, 'id'))
      .where(new Column(resourceType, 'lastUpdated'), '<', before)
      .execute(client);
  }
}
