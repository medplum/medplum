import { createReference, Operator } from '@medplum/core';
import { Appointment, Practitioner } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig, MedplumServerConfig } from '../config';
import { createTestProject, withTestContext } from '../test.setup';
import { Repository } from './repo';

describe('Medplum Custom Search Parameters', () => {
  let config: MedplumServerConfig;
  let repo: Repository;

  beforeAll(async () => {
    config = await loadTestConfig();
    await initAppServices(config);
  });

  beforeEach(async () => {
    const { project } = await createTestProject();
    repo = new Repository({
      strictMode: true,
      projects: [project.id as string],
      author: { reference: 'User/' + randomUUID() },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Search by Appointment.end', () =>
    withTestContext(async () => {
      const startTime1 = new Date('1970-01-01T12:00:00.000Z').toISOString();
      const endTime1 = new Date('1970-01-01T13:00:00.000Z').toISOString();

      const startTime2 = new Date('1970-01-01T13:00:00.000Z').toISOString();
      const endTime2 = new Date('1970-01-01T14:00:00.000Z').toISOString();

      const practitioner = await repo.createResource<Practitioner>({
        resourceType: 'Practitioner',
        name: [{ prefix: ['Dr.'], given: ['Alice'], family: 'Smith' }],
      });

      expect(practitioner).toBeDefined();

      const baseAppointment = {
        resourceType: 'Appointment',
        status: 'booked',
        participant: [
          {
            type: [
              {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                    code: 'ATND',
                    display: 'attender',
                  },
                ],
              },
            ],
            actor: createReference(practitioner),
            status: 'accepted',
          },
        ],
        appointmentType: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0276',
              code: 'FOLLOWUP',
              display: 'A follow up visit from a previous appointment',
            },
          ],
        },
      } satisfies Appointment;

      const appointment1 = await repo.createResource<Appointment>({
        ...baseAppointment,
        start: startTime1,
        end: endTime1,
      });

      const appointment2 = await repo.createResource<Appointment>({
        ...baseAppointment,
        start: startTime2,
        end: endTime2,
      });

      expect(appointment1).toBeDefined();
      expect(appointment2).toBeDefined();

      const results1 = await repo.search({
        resourceType: 'Appointment',
        filters: [
          { code: 'date', operator: Operator.GREATER_THAN_OR_EQUALS, value: startTime1 },
          { code: 'end', operator: Operator.LESS_THAN_OR_EQUALS, value: startTime2 },
        ],
      });

      expect(results1.entry).toHaveLength(1);
      expect(results1.entry?.[0].resource?.resourceType).toEqual('Appointment');
      expect((results1.entry?.[0].resource as Appointment).id).toEqual(appointment1.id);

      const results2 = await repo.search({
        resourceType: 'Appointment',
        filters: [
          { code: 'date', operator: Operator.GREATER_THAN_OR_EQUALS, value: startTime1 },
          { code: 'end', operator: Operator.LESS_THAN_OR_EQUALS, value: endTime2 },
        ],
      });

      expect(results2.entry).toHaveLength(2);
    }));
});
