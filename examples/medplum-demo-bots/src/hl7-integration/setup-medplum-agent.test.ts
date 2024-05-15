import {
  ContentType,
  createReference,
  getReferenceString,
  indexSearchParameterBundle,
  indexStructureDefinitionBundle,
} from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bot, Bundle, ClientApplication, QuestionnaireResponse, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './setup-medplum-agent';
import response from './setup-medplum-agent.questionnaireresponse.json';
import { randomUUID } from 'crypto';

describe('Setup Medplum Agent', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Set up Agent', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockImplementation(async (path: string | URL, body: any): Promise<any> => {
      if (path.toString().match(/admin\/projects\/.*\/bot/)) {
        const bot: Bot = {
          resourceType: 'Bot',
          name: body.name,
        };
        return medplum.repo.createResource(bot);
      }
      if (path.toString().match(/admin\/projects\/.*\/client/)) {
        const clientApp: ClientApplication = {
          resourceType: 'ClientApplication',
          name: body.name,
          secret: randomUUID(),
        };
        return medplum.repo.createResource(clientApp);
      }
      return MockClient.prototype.post(path, body);
    });
    await handler(medplum, {
      input: response as QuestionnaireResponse,
      secrets: {},
      contentType: ContentType.FHIR_JSON,
      bot: {},
    });
    // Check that organization is in place
    const checkOrganization = await medplum.searchOne('Organization', { name: 'Foo Medical' });
    expect(checkOrganization).toBeDefined();
    const endpoints = await medplum.searchResources('Endpoint', {
      organization: checkOrganization && getReferenceString(checkOrganization),
    });

    // Check for incoming channels
    expect(endpoints).toHaveLength(2);
    const channel1 = endpoints.find((e) => e.name === 'Test Channel');
    const channel2 = endpoints.find((e) => e.name === 'Production Channel');
    expect(channel1?.address).toBe('mllp://1.1.1.1:1234');
    expect(channel2?.address).toBe('mllp://1.1.1.2:1234');

    // Check for Inbound Bots
    const bot1 = await medplum.searchOne('Bot', { name: 'Foo Medical: Test Channel [Inbound]' });
    const bot2 = await medplum.searchOne('Bot', { name: 'Foo Medical: Production Channel [Inbound]' });
    expect(bot1).toBeDefined();
    expect(bot2).toBeDefined();

    // Check for Agent resource
    const agent = await medplum.searchOne('Agent', { identifier: 'http://example.com/agent-id|foo-medical-agent' });
    expect(agent).toBeDefined();
    expect(agent?.channel?.[0]).toMatchObject({
      name: 'Test Channel',
      endpoint: channel1 && createReference(channel1),
    });
    expect(agent?.channel?.[1]).toMatchObject({
      name: 'Production Channel',
      endpoint: channel2 && createReference(channel2),
    });

    // Check for ClientApp
    const client = await medplum.searchOne('ClientApplication', {
      name: 'Foo Medical Agent Client',
    });
    expect(client).toBeDefined();

    // Check for device resources
    const lisDevice = await medplum.searchOne('Device', { identifier: 'foo-medical-foo-lis' });
    const risDevice = await medplum.searchOne('Device', { identifier: 'foo-medical-foo-ris' });

    expect(lisDevice).toBeDefined();
    expect(lisDevice?.url).toBe('mllp://2.3.4.5:1234');
    expect(risDevice).toBeDefined();
    expect(risDevice?.url).toBe('mllp://2.3.4.5:9876');

    // Check for Outbound Bots
    const outboundBot = await medplum.searchOne('Bot', { name: 'Foo Medical [Outbound]' });
    expect(outboundBot).toBeDefined();
  });
});
