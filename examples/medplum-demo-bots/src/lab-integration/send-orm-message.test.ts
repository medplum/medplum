import { SNOMED, createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOrmMessage } from './send-orm-message';

describe('Send to Partner Lab', () => {
  beforeAll(() => {
    // Initialize FHIR structure definitions
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx: any) => {
    const medplum = new MockClient();

    // Create test patient
    const patient = await medplum.createResource({
      resourceType: 'Patient',
      name: [
        {
          given: ['Bob'],
          family: 'Smith',
        },
      ],
      birthDate: '1993-11-12',
      address: [
        {
          line: ['1601 S Brazier St'],
          city: 'Coonrod',
          state: 'TX',
          postalCode: '77301',
        },
      ],
      identifier: [
        {
          system: 'http://example.com/patientId',
          value: 'W6IOS157',
        },
      ],
      telecom: [
        {
          system: 'phone',
          value: '(111) 222-3456',
        },
      ],
      gender: 'male',
    });

    // Create requesting physician
    const requestingPhysician = await medplum.createResource({
      resourceType: 'Practitioner',
      name: [
        {
          prefix: ['Dr.'],
          given: ['Bill'],
          family: 'Ogden',
        },
      ],
      gender: 'male',
    });

    // Create specimen
    let specimen = await medplum.createResource<Specimen>({
      resourceType: 'Specimen',
      subject: createReference(patient),
      type: {
        coding: [
          {
            system: SNOMED,
            code: '122554006',
            display: 'Capillary blood specimen',
          },
        ],
      },
      collection: {
        collectedDateTime: '2023-02-14T14:05:33-06:00',
      },
      receivedTime: '2023-02-16T00:53:51.965Z',
    });

    // Create service request (order)
    const order = await medplum.createResource({
      resourceType: 'ServiceRequest',
      subject: createReference(patient),
      requester: createReference(requestingPhysician),
      status: 'completed',
      intent: 'order',
      authoredOn: '2023-01-30T18:31:34.929Z',
      specimen: [createReference(specimen)],
      identifier: [
        {
          system: 'http://example.com/orderId',
          value: '145632',
        },
      ],
    });

    // Update specimen with order reference
    specimen = await medplum.updateResource({ ...specimen, request: [createReference(order)] } as Specimen);

    // Store test resources in context
    Object.assign(ctx, { medplum, patient, requestingPhysician, order, specimen });
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test('Create ORM message with correct format', async (ctx: any) => {
    const serviceRequest: ServiceRequest = ctx.order;
    vi.setSystemTime(new Date('2023-02-10T09:25:00Z'));

    const message = createOrmMessage(serviceRequest, ctx.patient as Patient, ctx.specimen as Specimen);

    expect(message).toBeDefined();
    expect(message?.toString()).toBe(TEST_MESSAGE);
  });

  test('Create ORM message with missing resources', async (ctx: any) => {
    const serviceRequest: ServiceRequest = ctx.order;
    vi.setSystemTime(new Date('2023-02-10T09:25:00Z'));

    // Test with missing patient
    expect(() => createOrmMessage(serviceRequest, undefined as unknown as Patient, ctx.specimen as Specimen))
      .toThrow('Patient is required');

    // Test with missing specimen
    expect(() => createOrmMessage(serviceRequest, ctx.patient as Patient, undefined as unknown as Specimen))
      .toThrow('Specimen is required');
  });
});

const TEST_MESSAGE = `MSH|^~\\&||52054||ACME_LAB|202302100925||ORM^O01||P|2.3|||||||
PID|1|145632|145632||Smith^Bob||19931112|M|||||||||||
ORC|NW|145632|||R||||202302100925||||52054||||||
OBR|1|145632||8167^PANEL B FULL^^PANEL B FULL||202302100925|202302142005||||||||||||||||||||^^^^^R||||||`;
