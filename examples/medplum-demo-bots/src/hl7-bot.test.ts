import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './hl7-bot';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';

//To run these tests from the command line
//npm t src/hl7-bot.test.ts

//To run a specific test
//npm t src/hl7-bot.test.ts -t 'Update HL7 Message'

describe('HL7 Bots', async () => {
  // start-block index-schema
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Hello HL7 Message', async () => {
    const medplum = new MockClient();
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

  test('Update HL7 Message', async () => {
    const medplum = new MockClient();
    const bot: Reference<Bot> = { reference: 'Bot/123' };
    const input =
      Hl7Message.parse(`MSH|^~\\&|SendingApp|SendingFacility|HL7API|PKB|20190201113000||ADT^A08|ABC0000000003|P|2.4
PID|||9555555555^^^NHS^NH||Smith^John^Joe^^Mr||19700101|M|||My flat name^1, The Road^London^London^SW1A 1AA^GBR|||||||||||||||||||N|
PV1|1|I|^^^^^^^^My Ward Corrected||||^Jones^Stuart^James^^Dr^|^Smith^William^^^Dr^|^Foster^Terry^^^Mr^||||||||||enctrId|||||||||||||||||||||||||201902011000|
ZVN|A02|||||201902011015`);
    const contentType = 'x-application/hl7-v2+er7';
    const secrets = {};
    const result = await handler(medplum, { bot, input, contentType, secrets });
    expect(result.get('MSA')).toBeDefined();

    const patient = await medplum.searchOne('Patient', 'identifier=9555555555');
    expect(patient).toBeDefined();
    expect(patient?.name?.[0].family).toBe('Smith');
    expect(patient?.name?.[0].given?.[0]).toBe('John');
    expect(patient?.address?.[0].line?.[0]).toBe('My flat name');
    expect(patient?.address?.[0].city).toBe('London');
    expect(patient?.address?.[0].state).toBe('London');
    expect(patient?.address?.[0].postalCode).toBe('SW1A 1AA');
    expect(patient?.address?.[0].country).toBe('GBR');
  });

  // Additional test case to confirm updated fields are stored
  test('Update HL7 Message with different PV1 and ZVN segments', async () => {
    const medplum = new MockClient();
    const bot: Reference<Bot> = { reference: 'Bot/123' };
    const input =
      Hl7Message.parse(`MSH|^~\\&|SendingApp|SendingFacility|HL7API|PKB|20190201113000||ADT^A08|ABC0000000003|P|2.4
PID|||9555555555^^^NHS^NH||Smith^John^Joe^^Mr||19700101|M|||My flat name^1, The Road^London^London^SW1A 1AA^GBR|||||||||||||||||||N|
PV1|1|I|^^^^^^^^Main Outpatient||||^Jones^Stuart^James^^Dr^|^Smith^William^^^Dr^|^Foster^Terry^^^Mr^||||||||||enctrId2|||||||||||||||||||||||||201908091000|
ZVN|A05`);
    const contentType = 'x-application/hl7-v2+er7';
    const secrets = {};
    const result = await handler(medplum, { bot, input, contentType, secrets });
    expect(result.get('MSA')).toBeDefined();

    const patient = await medplum.searchOne('Patient', 'identifier=9555555555');
    expect(patient).toBeDefined();
    expect(patient?.name?.[0].family).toBe('Smith');
    expect(patient?.name?.[0].given?.[0]).toBe('John');
    expect(patient?.address?.[0].line?.[0]).toBe('My flat name');
    expect(patient?.address?.[0].city).toBe('London');
    expect(patient?.address?.[0].state).toBe('London');
    expect(patient?.address?.[0].postalCode).toBe('SW1A 1AA');
    expect(patient?.address?.[0].country).toBe('GBR');
  });
});
