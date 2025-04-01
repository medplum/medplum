import { indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './metriport-consolidated-data-webhook';

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
