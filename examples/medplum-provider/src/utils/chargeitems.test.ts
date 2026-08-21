// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { ChargeItem, ChargeItemDefinition, CodeableConcept, Condition, Encounter, ServiceRequest } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as chargeitemsModule from './chargeitems';

const {
  applyChargeItemDefinition,
  getChargeItemsForEncounter,
  calculateTotalPrice,
  relinkChargeItemToLabOrder,
  syncEncounterDiagnosesToVisitChargeItems,
} =
  chargeitemsModule;

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

  describe('syncEncounterDiagnosesToVisitChargeItems', () => {
    const encounter: Encounter = {
      resourceType: 'Encounter',
      id: 'encounter-1',
      status: 'in-progress',
      class: { code: 'AMB' },
    };
    const conditions: Condition[] = [
      {
        resourceType: 'Condition',
        id: 'cond-1',
        subject: { reference: 'Patient/patient-1' },
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E75.6' }] },
      },
      {
        resourceType: 'Condition',
        id: 'cond-2',
        subject: { reference: 'Patient/patient-1' },
        code: { coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'I10' }] },
      },
    ];

    function visitChargeItem(): ChargeItem {
      return {
        resourceType: 'ChargeItem',
        status: 'planned',
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '99203' }] },
        subject: { reference: 'Patient/patient-1' },
        context: { reference: 'Encounter/encounter-1' },
      };
    }

    test('sets reason on charge items without a ServiceRequest link, in rank order', async () => {
      const visitItem = await medplum.createResource<ChargeItem>(visitChargeItem());
      const orderItem = await medplum.createResource<ChargeItem>({
        ...visitChargeItem(),
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '80053' }] },
        supportingInformation: [{ reference: 'ServiceRequest/lab-order-1' }],
      });

      const updated = await syncEncounterDiagnosesToVisitChargeItems(medplum, encounter, conditions);

      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(visitItem.id);
      expect(updated[0].reason).toEqual([conditions[0].code, conditions[1].code]);
      const untouchedOrderItem = await medplum.readResource('ChargeItem', orderItem.id);
      expect(untouchedOrderItem.reason).toBeUndefined();
    });

    test('is a no-op when reason already matches', async () => {
      await medplum.createResource<ChargeItem>({
        ...visitChargeItem(),
        reason: [conditions[0].code as CodeableConcept, conditions[1].code as CodeableConcept],
      });

      const updated = await syncEncounterDiagnosesToVisitChargeItems(medplum, encounter, conditions);
      expect(updated).toHaveLength(0);
    });

    test('clears reason when the encounter has no diagnoses left', async () => {
      const visitItem = await medplum.createResource<ChargeItem>({
        ...visitChargeItem(),
        reason: [conditions[0].code as CodeableConcept],
      });

      const updated = await syncEncounterDiagnosesToVisitChargeItems(medplum, encounter, []);

      expect(updated).toHaveLength(1);
      expect(updated[0].id).toBe(visitItem.id);
      expect(updated[0].reason).toBeUndefined();
    });
  });

  describe('relinkChargeItemToLabOrder', () => {
    const encounterRef = { reference: 'Encounter/encounter-1' };
    const labOrder: WithId<ServiceRequest> = {
      resourceType: 'ServiceRequest',
      id: 'lab-order-1',
      status: 'active',
      intent: 'order',
      subject: { reference: 'Patient/patient-1' },
      reasonCode: [{ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10-cm', code: 'E11.9' }] }],
    };

    test('repoints supportingInformation and copies reasonCode', async () => {
      const chargeItem = await medplum.createResource<ChargeItem>({
        resourceType: 'ChargeItem',
        status: 'planned',
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '80053' }] },
        subject: { reference: 'Patient/patient-1' },
        context: encounterRef,
        supportingInformation: [{ reference: 'ServiceRequest/draft-sr-1' }],
      });

      const result = await relinkChargeItemToLabOrder(medplum, encounterRef, 'ServiceRequest/draft-sr-1', labOrder);

      expect(result?.id).toBe(chargeItem.id);
      expect(result?.supportingInformation).toEqual([{ reference: 'ServiceRequest/lab-order-1' }]);
      expect(result?.reason).toEqual(labOrder.reasonCode);
    });

    test('preserves other supportingInformation entries', async () => {
      await medplum.createResource<ChargeItem>({
        resourceType: 'ChargeItem',
        status: 'planned',
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '80053' }] },
        subject: { reference: 'Patient/patient-1' },
        context: encounterRef,
        supportingInformation: [{ reference: 'DocumentReference/doc-1' }, { reference: 'ServiceRequest/draft-sr-1' }],
      });

      const result = await relinkChargeItemToLabOrder(medplum, encounterRef, 'ServiceRequest/draft-sr-1', labOrder);

      expect(result?.supportingInformation).toEqual([
        { reference: 'DocumentReference/doc-1' },
        { reference: 'ServiceRequest/lab-order-1' },
      ]);
    });

    test('returns undefined when no ChargeItem references the draft order', async () => {
      await medplum.createResource<ChargeItem>({
        resourceType: 'ChargeItem',
        status: 'planned',
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '80053' }] },
        subject: { reference: 'Patient/patient-1' },
        context: encounterRef,
        supportingInformation: [{ reference: 'ServiceRequest/other-sr' }],
      });

      const result = await relinkChargeItemToLabOrder(medplum, encounterRef, 'ServiceRequest/draft-sr-1', labOrder);
      expect(result).toBeUndefined();
    });

    test('returns undefined without a previous reference', async () => {
      const result = await relinkChargeItemToLabOrder(medplum, encounterRef, undefined, labOrder);
      expect(result).toBeUndefined();
    });

    test('omits reason when the order has no reasonCode', async () => {
      await medplum.createResource<ChargeItem>({
        resourceType: 'ChargeItem',
        status: 'planned',
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '80053' }] },
        subject: { reference: 'Patient/patient-1' },
        context: encounterRef,
        supportingInformation: [{ reference: 'ServiceRequest/draft-sr-1' }],
      });

      const result = await relinkChargeItemToLabOrder(medplum, encounterRef, 'ServiceRequest/draft-sr-1', {
        ...labOrder,
        reasonCode: undefined,
      });

      expect(result?.supportingInformation).toEqual([{ reference: 'ServiceRequest/lab-order-1' }]);
      expect(result?.reason).toBeUndefined();
    });
  });
});
