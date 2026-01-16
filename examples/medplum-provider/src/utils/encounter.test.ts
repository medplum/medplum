// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { HTTP_HL7_ORG } from '@medplum/core';
import type { Appointment, Coding, Encounter, Patient, PlanDefinition, Practitioner, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createEncounter, updateEncounterStatus } from './encounter';

describe('encounter utils', () => {
  let medplum: MockClient;
  let practitioner: Practitioner;
  let patient: Patient;
  let classification: Coding;

  beforeEach(() => {
    medplum = new MockClient();
    practitioner = {
      resourceType: 'Practitioner',
      id: 'prac-1',
      name: [{ given: ['Demo'], family: 'Doctor' }],
    };
    patient = { resourceType: 'Patient', id: 'patient-1', name: [{ given: ['Pat'], family: 'Smith' }] };
    classification = { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' };
    vi.spyOn(medplum, 'getProfile').mockReturnValue(practitioner);
  });

  describe('createEncounter', () => {
    test('creates encounter and related resources', async () => {
      // Capture createResource calls and respond with deterministic IDs
      const createResourceSpy = vi.spyOn(medplum, 'createResource').mockImplementation(async (resource: any) => {
        if (resource.resourceType === 'Appointment') {
          return { ...resource, id: 'appt-1' };
        }
        if (resource.resourceType === 'Encounter') {
          return { ...resource, id: 'enc-1' };
        }
        if (resource.resourceType === 'ChargeItem') {
          return { ...resource, id: `charge-${Math.random()}` };
        }
        return { ...resource };
      });
      const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue({});
      const searchSpy = vi.spyOn(medplum, 'search').mockResolvedValue({
        entry: [
          {
            resource: {
              resourceType: 'Task',
              focus: { reference: 'ServiceRequest/sr-1' },
            } as Task,
          },
        ],
      } as any);
      vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
      const readReferenceSpy = vi.spyOn(medplum, 'readReference').mockResolvedValue({
        resourceType: 'ServiceRequest',
        id: 'sr-1',
        encounter: { reference: 'Encounter/enc-1' },
        code: { coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '1234' }] },
        occurrenceDateTime: '2020-01-01T12:00:00Z',
        extension: [
          {
            url: 'http://medplum.com/fhir/StructureDefinition/applicable-charge-definition',
            valueCanonical: 'ChargeItemDefinition/1',
          },
        ],
      } as any);

      const planDefinition: PlanDefinition = {
        resourceType: 'PlanDefinition',
        id: 'plan-1',
        extension: [
          {
            url: `${HTTP_HL7_ORG}/fhir/uv/order-catalog/StructureDefinition/ServiceBillingCode`,
            valueCodeableConcept: {
              coding: [{ system: 'http://www.ama-assn.org/go/cpt', code: '99202', display: 'Office visit' }],
            },
          },
          {
            url: 'http://medplum.com/fhir/StructureDefinition/applicable-charge-definition',
            valueCanonical: 'ChargeItemDefinition/plan',
          },
        ],
        status: 'active',
      };

      const encounter = await createEncounter(
        medplum,
        new Date('2020-01-01T10:00:00Z'),
        new Date('2020-01-01T10:30:00Z'),
        classification,
        patient,
        planDefinition
      );

      expect(encounter.status).toBe('planned');
      expect(encounter.id).toBe('enc-1');
      expect(createResourceSpy).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'Appointment' }));
      expect(postSpy).toHaveBeenCalled();
      expect(searchSpy).toHaveBeenCalledWith('Task', expect.objectContaining({ encounter: 'Encounter/enc-1' }));
      expect(readReferenceSpy).toHaveBeenCalledWith({ reference: 'ServiceRequest/sr-1' });
      // Ensure a ChargeItem was attempted from service request
      expect(
        createResourceSpy.mock.calls.some(([resource]) => resource.resourceType === 'ChargeItem' && resource.code)
      ).toBe(true);
    });
  });

  describe('updateEncounterStatus', () => {
    test('updates encounter period and appointment status', async () => {
      const encounter: WithId<Encounter> = {
        resourceType: 'Encounter',
        id: 'enc-1',
        status: 'planned',
        class: classification,
      };
      const appointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-1',
        status: 'booked',
        participant: [
          {
            actor: { reference: 'Practitioner/prac-1' },
            status: 'accepted',
          },
        ],
      };
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource) => resource as any);

      const updatedEncounter = await updateEncounterStatus(medplum, encounter, appointment, 'in-progress');

      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'Appointment', status: 'checked-in' })
      );
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ resourceType: 'Encounter', status: 'in-progress' })
      );
      expect(updatedEncounter.period?.start).toBeDefined();

      // Move to finished state
      await updateEncounterStatus(medplum, updatedEncounter, appointment, 'finished');
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'fulfilled' }));
    });

    test('updates appointment status for cancellation', async () => {
      const encounter: WithId<Encounter> = {
        resourceType: 'Encounter',
        id: 'enc-2',
        status: 'in-progress',
        class: classification,
      };
      const appointment: WithId<Appointment> = {
        resourceType: 'Appointment',
        id: 'appt-2',
        status: 'booked',
        participant: [
          {
            actor: { reference: 'Practitioner/prac-1' },
            status: 'accepted',
          },
        ],
      };
      const updateSpy = vi.spyOn(medplum, 'updateResource').mockImplementation(async (resource) => resource as any);

      await updateEncounterStatus(medplum, encounter, appointment, 'cancelled');

      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    });
  });
});
