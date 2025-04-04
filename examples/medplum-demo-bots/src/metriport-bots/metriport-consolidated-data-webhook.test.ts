import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Encounter, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';

import { convertToTransactionBundle, handler } from './metriport-consolidated-data-webhook';
import { MetriportConsolidatedDataBundle } from './metriport-test-data';

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

    expect(transactionBundle.type).toBe('transaction');
    expect(transactionBundle.resourceType).toBe('Bundle');
    expect(transactionBundle.entry).toBeDefined();

    transactionBundle.entry?.forEach((entry) => {
      expect(entry.request).toBeDefined();
      expect(entry.request?.method).toBe('PUT');
      expect(entry.resource?.id).toBeUndefined();

      // Special case for Patient resources
      if (entry.resource?.resourceType === 'Patient') {
        expect(entry.request?.url).toMatch(/^Patient\?name=.+&birthdate=.+$/);
      } else {
        expect(entry.request?.url).toMatch(/^[A-Za-z]+\?identifier=.+$/);
      }
    });
  });

  test('replaces references with fullUrls', () => {
    const transactionBundle = convertToTransactionBundle(MetriportConsolidatedDataBundle);

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
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: 'urn:uuid:123',
          resource: {
            resourceType: 'Patient',
            id: '123',
            name: [{ given: ['John'], family: 'Doe' }],
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle);

    expect((transactionBundle.entry?.[0].resource as any).identifier).toStrictEqual([
      {
        system: 'https://metriport.com/fhir/identifiers',
        value: '123',
      },
    ]);
  });

  test('adds metriport identifier to resource with existing identifiers', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: 'urn:uuid:123',
          resource: {
            resourceType: 'Patient',
            id: '123',
            name: [{ family: 'Smith', given: ['Jane'] }],
            gender: 'female',
            birthDate: '1996-02-10',
            identifier: [{ system: 'other-system', value: 'other-value' }],
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle);

    expect((transactionBundle.entry?.[0].resource as any).identifier).toStrictEqual([
      { system: 'other-system', value: 'other-value' },
      { system: 'https://metriport.com/fhir/identifiers', value: '123' },
    ]);
  });

  test('formats valid date property in DocumentReference', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: 'urn:uuid:123',
          resource: {
            resourceType: 'DocumentReference',
            id: '123',
            status: 'current',
            content: [{ attachment: { contentType: 'text/plain; charset=UTF-8' } }],
            date: '2024-01-01',
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle);

    expect((transactionBundle.entry?.[0].resource as any).date).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
  });

  test('removes invalid date property from DocumentReference', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'searchset',
      entry: [
        {
          fullUrl: 'urn:uuid:123',
          resource: {
            resourceType: 'DocumentReference',
            id: '123',
            status: 'current',
            content: [{ attachment: { contentType: 'text/plain; charset=UTF-8' } }],
            date: 'invalid-date',
          },
        },
      ],
    };

    const transactionBundle = convertToTransactionBundle(bundle);

    expect((transactionBundle.entry?.[0].resource as any).date).toBeUndefined();
  });
});
