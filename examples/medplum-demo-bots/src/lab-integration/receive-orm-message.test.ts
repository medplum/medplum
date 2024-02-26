import { SNOMED, createReference, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
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
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters.json') as Bundle<SearchParameter>);
    indexSearchParameterBundle(readJson('fhir/r4/search-parameters-medplum.json') as Bundle<SearchParameter>);
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
      await handler(ctx.medplum, { input: ctx.order, contentType: 'string', secrets: { ...CONNECTION_DETAILS } });
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

const TEST_MESSAGE = `MSH|^~\\&|FooGen|NG|LabX|LX|200307250948||ORM^O01|1059140905|T|2.5|||AL
PID|1|200|||Patient^Test||19901017|M|||||(610)123-4567||||||23456788
PV1|1|O|4747^^^4747||||UP2666^Smith MD^Alice|||||||||||||||||||||||||||||||||||||200307240000
IN1|1|HM0|BLUE|Blue Cross|AddressLine 1^AddressLine 2^City^Sta^99999|||543879|||||||HM|Family Name^Given Name^M|1||AddressLine 1^AddressLine 2^City^Sta^99999||||||||||||N|||||1234567|||||||||||T
GT1|1||Family Name^Given Name^M||AddressLine 1^AddressLine 2^City^Sta^99999|6106577010|||||1
ORC|NW|FGT6228|||||||200307241523|0071^supruser^supruser||UP2666^Smith MD^Alice
OBR|1|FGT6228||1032^Glucose, Serum^L|||200307240105||56^ml||N||||BL^none^Blood|UP2666^Smith MD^Alice|||||||||||^^^^^R
NTE|1|P|Please, call Dr. Smith with results ASAP. Call his cell phone:
NTE|2|P|345-678-9012
DG1|1|I9|251.1^Hypoglycemia NEC^I9|Hypoglycemia NEC
DG1|2|I9|251.2^Hypoglycemia NOS^I9|Hypoglycemia NOS
OBR|2|FGT6228||100123^Immunoglobulin M, Quant, CSF^L|||200307250948||||N|||||UP2666^Smith MD^Alice|||||||||||^^^^^R
DG1|1|I9|255.4^Insufficiency, corticoadrenal^I9|Insufficiency, corticoadrenal
`;
