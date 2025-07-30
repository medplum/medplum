import {
  ContentType,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Encounter, Patient, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { randomUUID } from 'crypto';

import { convertToTransactionBundle, handler } from './metriport-consolidated-data-webhook';
import {
  JaneSmithMedplumPatient,
  JaneSmithMetriportPatient,
  MetriportConsolidatedDataBundle,
} from './metriport-test-data';

describe('Metriport Consolidated Data Webhook', () => {
  const bot = { reference: 'Bot/123' };
  const contentType = 'application/fhir+json';
  const secrets = {
    METRIPORT_API_KEY: { name: 'METRIPORT_API_KEY', valueString: 'test-metriport-api-key' },
    METRIPORT_WEBHOOK_KEY: { name: 'METRIPORT_WEBHOOK_KEY', valueString: 'test-metriport-webhook-key' },
  };

  let medplum: MockClient;

  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  beforeEach(async () => {
    medplum = new MockClient();
  });

  test('throws error when missing METRIPORT_API_KEY', async () => {
    await expect(
      handler(medplum, {
        bot,
        input: {},
        contentType,
        secrets: { METRIPORT_WEBHOOK_KEY: secrets.METRIPORT_WEBHOOK_KEY },
      })
    ).rejects.toThrow('Missing METRIPORT_API_KEY');
  });

  test('throws error when missing METRIPORT_WEBHOOK_KEY', async () => {
    await expect(
      handler(medplum, { bot, input: {}, contentType, secrets: { METRIPORT_API_KEY: secrets.METRIPORT_API_KEY } })
    ).rejects.toThrow('Missing METRIPORT_WEBHOOK_KEY');
  });

  test('throws error when missing message type', async () => {
    await expect(handler(medplum, { bot, input: {}, contentType, secrets })).rejects.toThrow('Missing message type');
  });

  test('throws error when missing medplumPatientId', async () => {
    const input = {
      meta: {
        type: 'medical.consolidated-data',
      },
    };

    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow(
      'Missing medplumPatientId. The startConsolidatedQuery call must include the medplumPatientId metadata.'
    );
  });

  test("successfully handles 'ping' message", async () => {
    const pingSequence = 'test-ping-value';
    const input = {
      meta: {
        type: 'ping',
      },
      ping: pingSequence,
    };

    await expect(handler(medplum, { bot, input, contentType, secrets })).resolves.toEqual({ pong: pingSequence });
  });

  test("successfully handles 'medical.consolidated-data' message", async () => {
    let medplumPatient: Patient = await medplum.createResource(JaneSmithMedplumPatient);
    const medplumPatientReference = getReferenceString(medplumPatient);
    const medplumPatientId = medplumPatient.id as string;
    const metriportPatientId = JaneSmithMetriportPatient.id;

    const input = {
      meta: {
        messageId: randomUUID(),
        when: new Date().toISOString(),
        type: 'medical.consolidated-data',
        data: {
          medplumPatientId: medplumPatientId,
        },
      },
      patients: [
        {
          patientId: metriportPatientId,
          bundle: {
            entry: [
              {
                resource: {
                  resourceType: 'DocumentReference',
                  content: [
                    {
                      attachment: {
                        url: 'https://api.metriport.com/medical/v1/documents/test-document',
                        contentType: 'application/json',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValueOnce({
      json: vi.fn().mockResolvedValueOnce(MetriportConsolidatedDataBundle),
    });

    expect(medplumPatient.identifier).toBeUndefined();

    await expect(handler(medplum, { bot, input, contentType, secrets })).resolves.toEqual(true);

    expect(fetch).toHaveBeenCalledWith('https://api.metriport.com/medical/v1/documents/test-document');

    medplumPatient = await medplum.readResource('Patient', medplumPatientId);
    expect(medplumPatient.identifier).toStrictEqual([
      { system: 'https://metriport.com/fhir/identifiers/patient-id', value: metriportPatientId },
    ]);

    const practitioners = await medplum.searchResources(
      'Practitioner',
      'identifier=73fbeae4-f7e6-425b-b9c7-2ff7c258e24d'
    );
    expect(practitioners).toHaveLength(1);
    expect(practitioners[0].name?.[0].family).toBe('Smith');
    expect(practitioners[0].name?.[0].given).toEqual(['David', 'K']);

    // Verify DocumentReference was created
    const docRefs = await medplum.searchResources(
      'DocumentReference',
      'identifier=52c3523e-4912-4d48-97a8-7e531e0682cb'
    );
    expect(docRefs).toHaveLength(1);
    expect(docRefs[0].description).toStrictEqual('Progress Notes');
    expect(docRefs[0].subject?.reference).toStrictEqual(medplumPatientReference);

    const locations = await medplum.searchResources('Location', 'identifier=40a528af-5c42-4c05-ae03-f2527137f994');
    expect(locations).toHaveLength(1);
    expect(locations[0].name).toStrictEqual('MARY FREE BED AT SPARROW');

    const encounters = await medplum.searchResources('Encounter', 'identifier=9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5');
    expect(encounters).toHaveLength(1);
    expect(encounters[0].status).toStrictEqual('finished');
    expect(encounters[0].subject?.reference).toStrictEqual(medplumPatientReference);

    const allergies = await medplum.searchResources(
      'AllergyIntolerance',
      'identifier=51893137-becb-4f5b-963b-7741d1cb8de2'
    );
    expect(allergies).toHaveLength(1);
    expect(allergies[0].reaction?.[0].substance?.text).toStrictEqual('Dust');
    expect(allergies[0].patient?.reference).toStrictEqual(medplumPatientReference);

    const medications = await medplum.searchResources('Medication', 'identifier=7e6747bd-fc1a-418a-a178-8518db7f95f5');
    expect(medications).toHaveLength(1);
    expect(medications[0].code?.text).toStrictEqual('oxyCODONE-acetaminophen (PERCOCET) 5-325 mg tablet');

    const medicationRequests = await medplum.searchResources(
      'MedicationRequest',
      'identifier=46806a66-3b4c-43dd-ac0d-7d0b10042ee5'
    );
    expect(medicationRequests).toHaveLength(1);
    expect(medicationRequests[0].medicationReference?.reference).toStrictEqual(getReferenceString(medications[0]));
    expect(medicationRequests[0].subject?.reference).toStrictEqual(medplumPatientReference);
  });
});

describe('convertToTransactionBundle', () => {
  let medplum: MockClient;
  let patient: Patient;
  let medplumPatientId: string;

  beforeEach(async () => {
    medplum = new MockClient();
    patient = await medplum.createResource(JaneSmithMedplumPatient);
    medplumPatientId = patient.id as string;
  });

  test('converts a searchset bundle to a transaction bundle', () => {
    const transactionBundle = convertToTransactionBundle(MetriportConsolidatedDataBundle, medplumPatientId);

    expect(transactionBundle.type).toBe('transaction');
    expect(transactionBundle.resourceType).toBe('Bundle');
    expect(transactionBundle.entry).toBeDefined();

    transactionBundle.entry?.forEach((entry) => {
      expect(entry.request).toBeDefined();

      if (entry.resource?.resourceType === 'Binary' && entry.request?.url?.startsWith('Patient/')) {
        expect(entry.request?.method).toBe('PATCH');
        expect(entry.request?.url).toBe(`Patient/${medplumPatientId}`);
        expect(entry.resource.contentType).toBe(ContentType.JSON_PATCH);
        expect(entry.resource.data).toBeDefined();
      } else if (entry.resource) {
        expect(entry.request?.method).toBe('PUT');
        expect(entry.resource?.id).toBeUndefined();
        expect(entry.request?.url).toMatch(new RegExp(`^${entry.resource.resourceType}\\?identifier=.+$`));
      }
    });
  });

  test('replaces references with fullUrls', () => {
    const transactionBundle = convertToTransactionBundle(MetriportConsolidatedDataBundle, medplumPatientId);

    const encounter = transactionBundle.entry?.find((entry) => entry.resource?.resourceType === 'Encounter')
      ?.resource as Encounter;

    expect(encounter?.subject?.reference).toStrictEqual('urn:uuid:0195d965-bfbc-7825-8a8a-b48baf403559');
    expect(encounter?.participant?.[0]?.individual?.reference).toStrictEqual(
      'urn:uuid:73fbeae4-f7e6-425b-b9c7-2ff7c258e24d'
    );
    expect(encounter?.location?.[0]?.location?.reference).toStrictEqual(
      'urn:uuid:40a528af-5c42-4c05-ae03-f2527137f994'
    );
  });

  test('adds metriport identifier to resource without existing identifiers', () => {
    const id = randomUUID();
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: `urn:uuid:${id}`,
          resource: {
            resourceType: 'Practitioner',
            id,
            name: [{ given: ['Anne'], family: 'Doe' }],
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle, medplumPatientId);

    expect((transactionBundle.entry?.[0].resource as any).identifier).toStrictEqual([
      {
        system: 'https://metriport.com/fhir/identifiers/practitioner-id',
        value: id,
      },
    ]);
  });

  test('adds metriport identifier to resource with existing identifiers', () => {
    const id = randomUUID();
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: `urn:uuid:${id}`,
          resource: {
            resourceType: 'Practitioner',
            id,
            name: [{ given: ['Anne'], family: 'Doe' }],
            gender: 'female',
            birthDate: '1996-02-10',
            identifier: [{ system: 'other-system', value: 'other-value' }],
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle, medplumPatientId);

    expect((transactionBundle.entry?.[0].resource as any).identifier).toStrictEqual([
      { system: 'other-system', value: 'other-value' },
      { system: 'https://metriport.com/fhir/identifiers/practitioner-id', value: id },
    ]);
  });

  test('formats valid date property in DocumentReference', () => {
    const id = randomUUID();
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: `urn:uuid:${id}`,
          resource: {
            resourceType: 'DocumentReference',
            id,
            status: 'current',
            content: [{ attachment: { contentType: 'text/plain; charset=UTF-8' } }],
            date: '2024-01-01',
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle, medplumPatientId);

    expect((transactionBundle.entry?.[0].resource as any).date).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  test('removes invalid date property from DocumentReference', () => {
    const id = randomUUID();
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: `urn:uuid:${id}`,
          resource: {
            resourceType: 'DocumentReference',
            id,
            status: 'current',
            content: [{ attachment: { contentType: 'text/plain; charset=UTF-8' } }],
            date: 'invalid-date',
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle, medplumPatientId);

    expect((transactionBundle.entry?.[0].resource as any).date).toBeUndefined();
  });
});
