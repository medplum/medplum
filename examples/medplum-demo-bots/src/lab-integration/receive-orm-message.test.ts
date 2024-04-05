import {
  ContentType,
  Hl7Message,
  MedplumClient,
  formatHumanName,
  getCodeBySystem,
  getIdentifier,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import {
  Bundle,
  CodeableConcept,
  Encounter,
  Patient,
  Practitioner,
  Reference,
  SearchParameter,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { FACILITY_ORDER_CODE_SYSTEM, FACILITY_ORDER_ID, FACILITY_PATIENT_ID, handler } from './receive-orm-message';

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

    Object.assign(ctx, { medplum });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-02-10T09:25:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  test(`New Patient`, async (ctx: any) => {
    const medplum = ctx.medplum as MedplumClient;
    const message: Hl7Message = Hl7Message.parse(TEST_MESSAGE);
    await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: message,
      contentType: ContentType.HL7_V2,
      secrets: {},
    });
    const checkServiceRequests = await medplum.searchResources('ServiceRequest', {
      requisition: `${FACILITY_ORDER_ID}|FGT6228`,
    });

    expect(checkServiceRequests).toHaveLength(2);
    console.debug(JSON.stringify(checkServiceRequests, null, 2));
    const glucoseOrder = checkServiceRequests.find(
      (order) => getCodeBySystem(order.code as CodeableConcept, FACILITY_ORDER_CODE_SYSTEM) === '1032'
    );

    expect(glucoseOrder).toBeDefined();
    expect(glucoseOrder?.code).toMatchObject({
      coding: [
        {
          code: '1032',
          display: 'Glucose, Serum',
          system: FACILITY_ORDER_CODE_SYSTEM,
        },
      ],
    });
    expect(glucoseOrder?.reasonCode).toHaveLength(2);
    expect(glucoseOrder?.note).toMatchObject([
      { text: `Please, call Dr. Smith with results ASAP. Call her cell phone:` },
      { text: `345-678-9012` },
    ]);

    const igmOrder = checkServiceRequests.find(
      (order) => getCodeBySystem(order.code as CodeableConcept, FACILITY_ORDER_CODE_SYSTEM) === '100123'
    );
    expect(igmOrder).toBeDefined();
    expect(igmOrder?.code).toMatchObject({
      coding: [
        {
          code: '100123',
          display: 'Immunoglobulin M, Quant, CSF',
          system: FACILITY_ORDER_CODE_SYSTEM,
        },
      ],
    });
    expect(igmOrder?.reasonCode).toHaveLength(1);
    expect(igmOrder?.note).not.toBeDefined();

    const checkPatient = await medplum.readReference(glucoseOrder?.subject as Reference<Patient>);
    expect(formatHumanName(checkPatient?.name?.[0] ?? {})).toBe('Test Patient');
    expect(checkPatient.birthDate).toBe('1990-10-17');
    expect(checkPatient.gender).toBe('male');
    expect(getIdentifier(checkPatient, FACILITY_PATIENT_ID)).toBe('200');
    expect(getIdentifier(checkPatient, 'http://hl7.org/fhir/sid/us-ssn')).toBe('23456788');

    const checkEncounter = await medplum.readReference(igmOrder?.encounter as Reference<Encounter>);
    expect(checkEncounter).toBeDefined();
    expect(checkEncounter.period?.start).toBe('2003-07-24T05:00:00.000Z');
    // Check provider(s)
    const checkRequestingProvider = await medplum.readReference(glucoseOrder?.requester as Reference<Practitioner>);
    expect(checkRequestingProvider).toBeDefined();
    expect(formatHumanName(checkRequestingProvider?.name?.[0] ?? {})).toBe('Alice Smith MD');
  });
});

const TEST_MESSAGE = `MSH|^~\\&|FooGen|NG|LabX|LX|200307250948||ORM^O01|1059140905|T|2.5|||AL
PID|1|200|||Patient^Test||19901017|M|||||(610)123-4567||||||23456788
PV1|1|O|4747^^^4747||||UP2666^Smith MD^Alice|||||||||||||||||||||||||||||||||||||200307240000
IN1|1|HM0|BLUE|Blue Cross|AddressLine 1^AddressLine 2^City^Sta^99999|||543879|||||||HM|Family Name^Given Name^M|1||AddressLine 1^AddressLine 2^City^Sta^99999||||||||||||N|||||1234567|||||||||||T
GT1|1||Family Name^Given Name^M||AddressLine 1^AddressLine 2^City^Sta^99999|6106577010|||||1
ORC|NW|FGT6228|||||||200307241523|0071^supruser^supruser||UP2666^Smith MD^Alice
OBR|1|FGT6228||1032^Glucose, Serum^L|||200307240105||56^ml||N||||BL^none^Blood|UP2666^Smith MD^Alice|||||||||||^^^^^R
NTE|1|P|Please, call Dr. Smith with results ASAP. Call her cell phone:
NTE|2|P|345-678-9012
DG1|1|I9|251.1^Hypoglycemia NEC^I9|Hypoglycemia NEC
DG1|2|I9|251.2^Hypoglycemia NOS^I9|Hypoglycemia NOS
OBR|2|FGT6228||100123^Immunoglobulin M, Quant, CSF^L|||200307250948||||N|||||UP2666^Smith MD^Alice|||||||||||^^^^^R
DG1|1|I9|255.4^Insufficiency, corticoadrenal^I9|Insufficiency, corticoadrenal
`;
