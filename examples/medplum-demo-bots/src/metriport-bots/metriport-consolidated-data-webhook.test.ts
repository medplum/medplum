import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Encounter, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { convertToTransactionBundle, handler, processResourceForUpsert } from './metriport-consolidated-data-webhook';
import { MetriportConsolidatedDataBundle } from './metriport-patient-bot-test-data';

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

  test('successfully handles ping message', async () => {
    const pingSequence = 'test-ping-value';
    const input = {
      meta: {
        type: 'ping',
      },
      ping: pingSequence,
    };

    await expect(handler(medplum, { bot, input, contentType, secrets })).resolves.toEqual({ pong: pingSequence });
  });
});

describe('convertToTransactionBundle', () => {
  test('converts a searchset bundle to a transaction bundle', () => {
    const transactionBundle = convertToTransactionBundle(MetriportConsolidatedDataBundle);

    console.log(JSON.stringify(transactionBundle, null, 2));

    expect(transactionBundle.type).toBe('transaction');
    expect(transactionBundle.resourceType).toBe('Bundle');
    expect(transactionBundle.entry).toBeDefined();

    transactionBundle.entry?.forEach((entry) => {
      expect(entry.request).toBeDefined();
      expect(entry.request?.method).toBe('PUT');
      expect(entry.resource?.id).toBeUndefined();
      expect(entry.request?.url).toMatch(/^[A-Za-z]+\?identifier=.+$/);
    });
  });
});

describe('processResourceForUpsert', () => {
  test('adds metriport identifier to resource without existing identifiers', () => {
    const resource = {
      resourceType: 'Patient',
      id: '123',
      name: [{ given: ['John'], family: 'Doe' }],
    };

    const processedResource = processResourceForUpsert(resource, new Map());

    expect(processedResource.identifier).toStrictEqual([
      {
        system: 'https://metriport.com/fhir/identifiers',
        value: '123',
      },
    ]);
  });

  test('adds metriport identifier to resource with existing identifiers', () => {
    const resourceWithIdentifier = {
      resourceType: 'Patient',
      id: '123',
      identifier: [{ system: 'other-system', value: 'other-value' }],
    };

    const processedResourceWithExisting = processResourceForUpsert(resourceWithIdentifier, new Map());

    expect(processedResourceWithExisting.identifier).toStrictEqual([
      {
        system: 'other-system',
        value: 'other-value',
      },
      {
        system: 'https://metriport.com/fhir/identifiers',
        value: '123',
      },
    ]);
  });

  test('formats valid date property in DocumentReference', () => {
    const resource = {
      resourceType: 'DocumentReference',
      id: '123',
      date: '2024-01-01',
    };

    const processedResource = processResourceForUpsert(resource, new Map());
    expect(processedResource.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  test('removes invalid date property from DocumentReference', () => {
    const resourceWithInvalidDate = {
      resourceType: 'DocumentReference',
      id: '123',
      date: 'invalid-date',
    };

    const processedInvalidResource = processResourceForUpsert(resourceWithInvalidDate, new Map());
    expect(processedInvalidResource.date).toBeUndefined();
  });

  test('replaces references with fullUrls', () => {
    const idToFullUrlMap = new Map<string, string>();
    idToFullUrlMap.set('0195d965-bfbc-7825-8a8a-b48baf403559', 'urn:uuid:0195d965-bfbc-7825-8a8a-b48baf403559');
    idToFullUrlMap.set('73fbeae4-f7e6-425b-b9c7-2ff7c258e24d', 'urn:uuid:73fbeae4-f7e6-425b-b9c7-2ff7c258e24d');
    idToFullUrlMap.set('40a528af-5c42-4c05-ae03-f2527137f994', 'urn:uuid:40a528af-5c42-4c05-ae03-f2527137f994');
    idToFullUrlMap.set('9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5', 'urn:uuid:9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5');

    const resource: Encounter = {
      resourceType: 'Encounter',
      id: '9617b8a1-efd0-4d37-bc0c-ae8b5a5a00a5',
      status: 'finished',
      class: {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'Inpatient Encounter',
      },
      subject: { reference: 'Patient/0195d965-bfbc-7825-8a8a-b48baf403559' },
      participant: [
        {
          individual: { reference: 'Practitioner/73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' },
        },
      ],
      location: [
        {
          location: {
            reference: 'Location/40a528af-5c42-4c05-ae03-f2527137f994',
            display: 'MARY FREE BED AT SPARROW',
          },
        },
      ],
    };

    const processedResource = processResourceForUpsert(resource, idToFullUrlMap);

    expect(processedResource.subject).toStrictEqual({ reference: 'urn:uuid:0195d965-bfbc-7825-8a8a-b48baf403559' });
    expect(processedResource.participant).toStrictEqual([
      { individual: { reference: 'urn:uuid:73fbeae4-f7e6-425b-b9c7-2ff7c258e24d' } },
    ]);
    expect(processedResource.location[0].location).toStrictEqual({
      reference: 'urn:uuid:40a528af-5c42-4c05-ae03-f2527137f994',
      display: 'MARY FREE BED AT SPARROW',
    });
  });
});
