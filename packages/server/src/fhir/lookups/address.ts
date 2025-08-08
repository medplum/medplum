// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatAddress, WithId } from '@medplum/core';
import { Address, Resource, ResourceType, SearchParameter } from '@medplum/fhirtypes';
import { Pool, PoolClient } from 'pg';
import { Column, DeleteQuery } from '../sql';
import { LookupTable, LookupTableRow } from './lookuptable';

export interface AddressTableRow extends LookupTableRow {
  address: string | undefined;
  city: string | undefined;
  country: string | undefined;
  postalCode: string | undefined;
  state: string | undefined;
  use: string | undefined;
}

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

  extractValues(result: AddressTableRow[], resource: WithId<Resource>): void {
    const addresses = this.getIncomingAddresses(resource);
    if (!Array.isArray(addresses)) {
      return;
    }

    for (const address of addresses) {
      const extracted = {
        resourceId: resource.id,
        // logical OR coalesce to ensure that empty strings are inserted as NULL
        address: formatAddress(address) || undefined, // formatAddress can return the empty string
        city: address.city?.trim() || undefined,
        country: address.country?.trim() || undefined,
        postalCode: address.postalCode?.trim() || undefined,
        state: address.state?.trim() || undefined,
        use: address.use?.trim() || undefined,
      };
      if (
        (extracted.address ||
          extracted.city ||
          extracted.country ||
          extracted.postalCode ||
          extracted.state ||
          extracted.use) &&
        !result.some(
          (a) =>
            a.resourceId === extracted.resourceId &&
            a.address === extracted.address &&
            a.city === extracted.city &&
            a.country === extracted.country &&
            a.postalCode === extracted.postalCode &&
            a.state === extracted.state &&
            a.use === extracted.use
        )
      ) {
        result.push(extracted);
      }
    }
  }

  async batchIndexResources<T extends Resource>(
    client: PoolClient,
    resources: WithId<T>[],
    create: boolean
  ): Promise<void> {
    if (!resources[0] || !AddressTable.hasAddress(resources[0].resourceType)) {
      return;
    }

    await super.batchIndexResources(client, resources, create);
  }

  private getIncomingAddresses(resource: Resource): Address[] | undefined {
    if (!AddressTable.hasAddress(resource.resourceType)) {
      return undefined;
    }

    let addresses: (Address | undefined | null)[] | undefined;

    switch (resource.resourceType) {
      case 'Patient':
      case 'Person':
      case 'Practitioner':
      case 'RelatedPerson':
      case 'Organization':
        addresses = resource.address;
        break;
      case 'InsurancePlan':
        addresses = resource.contact?.map((contact) => contact.address);
        break;
      case 'Location':
        addresses = resource.address ? [resource.address] : undefined;
        break;
      default:
        resource.resourceType satisfies never;
        return undefined;
    }

    return addresses?.filter((a) => !!a);
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
    const resourceId = resource.id;
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
