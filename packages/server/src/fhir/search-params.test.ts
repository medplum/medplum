import { createReference, getReferenceString, Operator } from '@medplum/core';
import { Appointment, DiagnosticReport, Flag, Patient, Practitioner, Slot } from '@medplum/fhirtypes';
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

  test('Search by Slot.end', () =>
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

      const baseSlot = {
        resourceType: 'Slot',
        status: 'free',
        schedule: { reference: 'Schedule/123' },
        start: new Date().toISOString(),
        end: new Date().toISOString(),
      } satisfies Slot;

      const slot1 = await repo.createResource<Slot>({
        ...baseSlot,
        start: startTime1,
        end: endTime1,
      });

      const slot2 = await repo.createResource<Slot>({
        ...baseSlot,
        start: startTime2,
        end: endTime2,
      });

      expect(slot1).toBeDefined();
      expect(slot2).toBeDefined();

      const results1 = await repo.search({
        resourceType: 'Slot',
        filters: [
          { code: 'start', operator: Operator.GREATER_THAN_OR_EQUALS, value: startTime1 },
          { code: 'end', operator: Operator.LESS_THAN_OR_EQUALS, value: startTime2 },
        ],
      });

      expect(results1.entry).toHaveLength(1);
      expect(results1.entry?.[0].resource?.resourceType).toEqual('Slot');
      expect((results1.entry?.[0].resource as Slot).id).toEqual(slot1.id);

      const results2 = await repo.search({
        resourceType: 'Slot',
        filters: [
          { code: 'start', operator: Operator.GREATER_THAN_OR_EQUALS, value: startTime1 },
          { code: 'end', operator: Operator.LESS_THAN_OR_EQUALS, value: endTime2 },
        ],
      });

      expect(results2.entry).toHaveLength(2);
    }));

  test('Search by DiagnosticReport.study', async () =>
    withTestContext(async () => {
      const patient = await repo.createResource<Patient>({
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      });

      const study1 = await repo.createResource({
        resourceType: 'ImagingStudy',
        status: 'available',
        subject: createReference(patient),
      });

      const study2 = await repo.createResource({
        resourceType: 'ImagingStudy',
        status: 'available',
        subject: createReference(patient),
      });

      const report1 = (await repo.createResource({
        resourceType: 'DiagnosticReport',
        imagingStudy: [createReference(study1)],
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '10221-0',
              display: 'Surgical operation note specimens taken Narrative',
            },
          ],
          text: 'Surgical operation note specimens taken Narrative',
        },
      })) as DiagnosticReport;

      const report2 = (await repo.createResource({
        resourceType: 'DiagnosticReport',
        imagingStudy: [createReference(study2)],
        status: 'final',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '10221-0',
              display: 'Surgical operation note specimens taken Narrative',
            },
          ],
          text: 'Surgical operation note specimens taken Narrative',
        },
      })) as DiagnosticReport;

      expect(study1).toBeDefined();
      expect(study2).toBeDefined();
      expect(report1).toBeDefined();
      expect(report2).toBeDefined();

      const results1 = await repo.search({
        resourceType: 'DiagnosticReport',
        filters: [{ code: 'study', operator: Operator.EQUALS, value: getReferenceString(study1) }],
      });

      expect(results1.entry).toHaveLength(1);
      expect(results1.entry?.[0].resource?.resourceType).toEqual('DiagnosticReport');
      expect((results1.entry?.[0].resource as DiagnosticReport).id).toEqual(report1.id);

      const results2 = await repo.search({
        resourceType: 'DiagnosticReport',
        filters: [{ code: 'study', operator: Operator.NOT_EQUALS, value: getReferenceString(study1) }],
      });

      expect(results2.entry).toHaveLength(1);
      expect(results2.entry?.[0].resource?.resourceType).toEqual('DiagnosticReport');
      expect((results2.entry?.[0].resource as DiagnosticReport).id).toEqual(report2.id);
    }));

  test('Search by Flag.category', () =>
    withTestContext(async () => {
      const patient = await repo.createResource({ resourceType: 'Patient' });
      expect(patient).toBeDefined();

      const flag1: Flag = await repo.createResource({
        resourceType: 'Flag',
        status: 'active',
        subject: createReference(patient),
        category: [
          {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/flag-category', code: 'drug', display: 'Drug' }],
          },
        ],
        code: { coding: [{ system: 'http://snomed.info/sct', code: '3902000' }] },
      });

      const flag2: Flag = await repo.createResource({
        resourceType: 'Flag',
        status: 'active',
        subject: createReference(patient),
        category: [
          {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/flag-category', code: 'lab', display: 'Lab' }],
          },
        ],
        code: { coding: [{ system: 'http://snomed.info/sct', code: '3902000' }] },
      });

      expect(flag1).toBeDefined();
      expect(flag2).toBeDefined();

      const results = await repo.search({
        resourceType: 'Flag',
        filters: [
          {
            code: 'category',
            operator: Operator.EQUALS,
            value: 'http://terminology.hl7.org/CodeSystem/flag-category|drug',
          },
        ],
      });

      expect(results.entry).toHaveLength(1);
      expect(results.entry?.[0].resource?.resourceType).toEqual('Flag');
      expect(results.entry?.[0].resource?.id as string).toEqual(flag1.id as string);
    }));
});
