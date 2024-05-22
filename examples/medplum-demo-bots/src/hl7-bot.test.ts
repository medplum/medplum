import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';
import { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hl7-bot';

const medplum = new MockClient();

test('Hello HL7 Message', async () => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
    indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
  }
  const bot: Reference<Bot> = { reference: 'Bot/123' };
  const input = Hl7Message.parse(`MSH|^~\\&|Primary||CL|PDMT|20200312081842|168866|ADT^A28|203598|T|2.3|||||||||||
EVN|A28|20200312081842||REG_UPDATE|168866^GLOVER^JASMIN^^^^^^PHC^^^^^10010||
PID|1||E3866011^^^EPIC^MRN~900093259^^^EPI^MR||TESTING^UGA||20000312|M|||^^^^^USA^P||||||||123-54-8888|||||N||||||N||
PD1|||PHYSICIANS ATLANTIC STATION^^10010|||||||||||||||
PV1|1|N||||||||||||||||||||||||||||||||||||||||||||||||||||
PV2||||||||||||||||||||||N|||||||||||||||||||||||||||`);
  const contentType = 'x-application/hl7-v2+er7';
  const secrets = {};
  const result = await handler(medplum, { bot, input, contentType, secrets });
  expect(result.get('MSA')).toBeDefined();
});
