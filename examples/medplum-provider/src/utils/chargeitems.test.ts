// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ChargeItem, ChargeItemDefinition, Encounter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as chargeitemsModule from './chargeitems';

const { applyChargeItemDefinition, getChargeItemsForEncounter, calculateTotalPrice } = chargeitemsModule;

describe('chargeitems utils', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('applyChargeItemDefinition', () => {
    const chargeItem: WithId<ChargeItem> = {
      resourceType: 'ChargeItem',
      id: 'charge-1',
      status: 'planned',
      code: {
        text: 'Test Charge Item',
        coding: [{ system: 'http://example.com', code: '1234' }],
      },
      subject: { reference: 'Patient/patient-1' },
    };

    test('returns original charge item when no definition canonical', async () => {
      const result = await applyChargeItemDefinition(medplum, chargeItem);
      expect(result).toBe(chargeItem);
    });

    test('returns original charge item when definition not found', async () => {
      const canonicalItem: WithId<ChargeItem> = {
        ...chargeItem,
        definitionCanonical: ['ChargeItemDefinition/123'],
      };
      const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

      const result = await applyChargeItemDefinition(medplum, canonicalItem);

      expect(searchSpy).toHaveBeenCalledWith('ChargeItemDefinition', 'url=ChargeItemDefinition/123');
      expect(result).toBe(canonicalItem);
    });

    test('applies definition and returns updated charge item', async () => {
      const canonicalItem: WithId<ChargeItem> = {
        ...chargeItem,
        definitionCanonical: ['ChargeItemDefinition/123'],
      };
      const definition: ChargeItemDefinition = {
        resourceType: 'ChargeItemDefinition',
        id: 'cid-1',
        url: 'http://example.com/chargeitemdefinition/123',
        status: 'active',
      };
      vi.spyOn(medplum, 'searchResources').mockResolvedValue([definition] as any);
      const updatedChargeItem: WithId<ChargeItem> = { ...canonicalItem, status: 'billable' };
      const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(updatedChargeItem);

      const result = await applyChargeItemDefinition(medplum, canonicalItem);

      expect(postSpy).toHaveBeenCalledWith(
        medplum.fhirUrl('ChargeItemDefinition', 'cid-1', '$apply'),
        expect.objectContaining({
          resourceType: 'Parameters',
        })
      );
      expect(result).toEqual(updatedChargeItem);
    });
  });

  describe('getChargeItemsForEncounter', () => {
    test('returns empty array when encounter missing', async () => {
      const result = await getChargeItemsForEncounter(medplum, undefined as unknown as Encounter);
      expect(result).toEqual([]);
    });

    test('fetches charge items for encounter', async () => {
      const encounter: WithId<Encounter> = {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'finished',
        class: { code: 'AMB', system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode' },
      };
      const chargeItem: WithId<ChargeItem> = {
        resourceType: 'ChargeItem',
        id: 'charge-1',
        status: 'billable',
        code: {
          text: 'Test Charge Item',
          coding: [{ system: 'http://example.com', code: '1234' }],
        },
        subject: { reference: 'Patient/patient-1' },
      };
      vi.spyOn(medplum, 'searchResources').mockResolvedValue([chargeItem] as any);

      const result = await getChargeItemsForEncounter(medplum, encounter);

      expect(result).toEqual([chargeItem]);
    });
  });

  describe('calculateTotalPrice', () => {
    test('sums up price overrides', () => {
      const items: WithId<ChargeItem>[] = [
        {
          resourceType: 'ChargeItem',
          id: '1',
          status: 'billable',
          priceOverride: { value: 10 },
          code: { text: 'Test Charge Item', coding: [{ system: 'http://example.com', code: '1234' }] },
          subject: { reference: 'Patient/patient-1' },
        },
        {
          resourceType: 'ChargeItem',
          id: '2',
          status: 'billable',
          priceOverride: { value: 15.5 },
          code: { text: 'Test Charge Item', coding: [{ system: 'http://example.com', code: '1234' }] },
          subject: { reference: 'Patient/patient-1' },
        },
        {
          resourceType: 'ChargeItem',
          id: '3',
          status: 'billable',
          priceOverride: { value: 20 },
          code: { text: 'Test Charge Item', coding: [{ system: 'http://example.com', code: '1234' }] },
          subject: { reference: 'Patient/patient-1' },
        },
      ];

      expect(calculateTotalPrice(items)).toBe(45.5);
    });
  });
});
