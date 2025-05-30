import { SNOMED, createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bundle, Patient, SearchParameter, ServiceRequest, Specimen } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import * as dotenv from 'dotenv';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { createOrmMessage, handler } from './send-orm-message';
dotenv.config();

const CONNECTION_DETAILS = {
  SFTP_USER: { name: 'SFTP_USER', valueString: 'user' },
  SFTP_HOST: { name: 'SFTP_HOST', valueString: '123456.transfer.us-east-1.amazonaws.com' },
  SFTP_PRIVATE_KEY: { name: 'SFTP_PRIVATE_KEY', valueString: process.env.PRIVATE_KEY },
};

vi.mock('ssh2-sftp-client');

describe('Send to Partner Lab', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async (ctx: any) => {
    const medplum = new MockClient();

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
          system: ' http://example.com/patientId',
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

    specimen = await medplum.updateResource({ ...specimen, request: [createReference(order)] } as Specimen);

    Object.assign(ctx, { medplum, patient, requestingPhysician, order, specimen });
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test.skip('Test Connection', async (ctx: any) => {
    try {
      await handler(ctx.medplum, {
        bot: { reference: 'Bot/123' },
        input: ctx.order,
        contentType: 'string',
        secrets: { ...CONNECTION_DETAILS },
      });
    } catch {
      console.error('Here');
    }
  });

  test(`ORM Message Format`, async (ctx: any) => {
    const serviceRequest: ServiceRequest = ctx.order;
    vi.setSystemTime(new Date('2023-02-10T09:25:00Z'));

    const message = createOrmMessage(serviceRequest, ctx.patient as Patient, ctx.specimen as Specimen);

    expect(message?.toString()).toBe(TEST_MESSAGE);
  });
});

const TEST_MESSAGE = `MSH|^~\\&||52054||ACME_LAB|202302100925||ORM^O01||P|2.3|||||||
PID|1|145632|145632||Smith^Bob||19931112|M|||||||||||
ORC|NW|145632|||R||||202302100925||||52054||||||
OBR|1|145632||8167^PANEL B FULL^^PANEL B FULL||202302100925|202302142005||||||||||||||||||||^^^^^R||||||`;
