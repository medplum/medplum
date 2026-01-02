// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { CPT, createReference } from '@medplum/core';
import type { ChargeItem, Claim, Coverage } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createClaimFromEncounter, getCptChargeItems } from './claims';
import * as coverageModule from './coverage';

describe('claims utils', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCptChargeItems', () => {
    test('filters charge items to CPT codings and preserves modifiers', () => {
      const cptItem: ChargeItem = {
        resourceType: 'ChargeItem',
        id: 'charge-1',
        code: {
          text: 'Test CPT',
          coding: [
            { system: CPT, code: '1234' },
            { system: 'http://example.com', code: 'other' },
          ],
        },
        priceOverride: { value: 42 },
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/chargeitem-modifier',
            valueCodeableConcept: { coding: [{ code: '59' }] },
          },
        ],
        status: 'billable',
        subject: { reference: 'Patient/patient-1' },
      };
      const nonCptItem: ChargeItem = {
        resourceType: 'ChargeItem',
        id: 'charge-2',
        code: { coding: [{ system: 'http://example.com', code: 'not-cpt' }] },
        status: 'billable',
        subject: { reference: 'Patient/patient-1' },
      };

      const items = getCptChargeItems([cptItem, nonCptItem], { reference: 'Encounter/enc-1' });

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual(
        expect.objectContaining({
          sequence: 1,
          encounter: [{ reference: 'Encounter/enc-1' }],
          productOrService: expect.objectContaining({
            coding: [{ system: CPT, code: '1234' }],
            text: 'Test CPT',
          }),
          modifier: [{ coding: [{ code: '59' }] }],
          net: { value: 42 },
        })
      );
    });
  });

  describe('createClaimFromEncounter', () => {
    const chargeItems: WithId<ChargeItem>[] = [
      {
        resourceType: 'ChargeItem',
        id: 'charge-1',
        code: { coding: [{ system: CPT, code: '1111' }], text: 'Visit' },
        priceOverride: { value: 25 },
        status: 'billable',
        subject: { reference: 'Patient/patient-1' },
      },
    ];

    test('creates claim using existing coverage', async () => {
      const patient = await medplum.updateResource({
        resourceType: 'Patient',
        id: 'patient-1',
      });

      const encounter = await medplum.updateResource({
        resourceType: 'Encounter',
        id: 'encounter-1',
        subject: createReference(patient),
        status: 'finished',
        class: { code: 'outpatient' },
      });

      const practitioner = await medplum.updateResource({
        resourceType: 'Practitioner',
        id: 'practitioner-1',
      });

      const coverage: Coverage = {
        resourceType: 'Coverage',
        id: 'coverage-1',
        status: 'active',
        beneficiary: { reference: 'Patient/patient-1' },
        payor: [{ reference: 'Organization/organization-1' }],
      };

      const claim: Claim = {
        resourceType: 'Claim',
        id: 'claim-1',
        status: 'draft',
        type: { coding: [{ code: 'professional' }] },
        use: 'claim',
        created: new Date().toISOString(),
        patient: { reference: 'Patient/patient-1' },
        provider: { reference: 'Practitioner/practitioner-1' },
        priority: { coding: [{ code: 'normal' }] },
        insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/coverage-1' } }],
        item: [
          {
            sequence: 1,
            encounter: [{ reference: 'Encounter/encounter-1' }],
            productOrService: { coding: [{ system: CPT, code: '1111' }], text: 'Visit' },
            net: { value: 25 },
          },
        ],
        total: { value: 25 },
      };

      vi.spyOn(medplum, 'searchResources').mockResolvedValue([coverage] as any);
      const createSpy = vi.spyOn(medplum, 'createResource').mockResolvedValue(claim as any);

      const result = await createClaimFromEncounter(medplum, patient, encounter, practitioner, chargeItems);

      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          insurance: [
            expect.objectContaining({
              coverage: { reference: 'Coverage/coverage-1' },
            }),
          ],
          patient: { reference: 'Patient/patient-1' },
          provider: expect.objectContaining({ reference: 'Practitioner/practitioner-1' }),
          total: { value: 25 },
        })
      );
      expect(result).toBe(claim);
    });

    test('creates self-pay coverage when no coverage exists', async () => {
      const patient = await medplum.updateResource({
        resourceType: 'Patient',
        id: 'patient-1',
      });

      const encounter = await medplum.updateResource({
        resourceType: 'Encounter',
        id: 'enc-1',
        subject: createReference(patient),
        status: 'finished',
        class: { code: 'outpatient' },
      });

      const practitioner = await medplum.updateResource({
        resourceType: 'Practitioner',
        id: 'prac-1',
      });

      vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);

      const createdCoverage: Coverage = {
        resourceType: 'Coverage',
        id: 'coverage-self',
        status: 'active',
        beneficiary: { reference: 'Patient/patient-1' },
        payor: [{ reference: 'Organization/organization-1' }],
      };

      const coverageSpy = vi.spyOn(coverageModule, 'createSelfPayCoverage').mockResolvedValue(createdCoverage);
      vi.spyOn(medplum, 'createResource').mockResolvedValue({ resourceType: 'Claim' } as any);

      await createClaimFromEncounter(medplum, patient, encounter, practitioner, chargeItems);

      expect(coverageSpy).toHaveBeenCalledWith(
        medplum,
        expect.objectContaining({ resourceType: 'Patient', id: 'patient-1' })
      );
    });
  });
});
