import { Hl7Message, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { Bot, Bundle, Reference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './dft-transfer-bot';
import { SEARCH_PARAMETER_BUNDLE_FILES, readJson } from '@medplum/definitions';

describe('DFT Message Cursor Tests', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('DFT Message with Insurance Creates Patient, Coverage, and Claim', async () => {
    const medplum = new MockClient();
    const bot: Reference<Bot> = { reference: 'Bot/123' };
    const input =
      Hl7Message.parse(`MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||DFT^P03|MSG00001|P|2.3
EVN|P03|20240218153044
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345^USA
FT1|1|ABC123|9876|20240218|20240218|CG|150.00|1|Units|||||||||||||99213^Office Visit^CPT
PR1|1||99213^Office Visit^CPT|20240218|GP
IN1|1|MEDICARE|12345|MEDICARE||||||||||||||||||||||||||||||||123456789A`);
    const contentType = 'x-application/hl7-v2+er7';
    const secrets = {};
    const result = await handler(medplum, { bot, input, contentType, secrets });

    // Verify ACK message
    expect(result.get('MSA')).toBeDefined();

    // Verify Patient creation
    const patient = await medplum.searchOne('Patient', 'identifier=12345');
    expect(patient).toBeDefined();
    expect(patient?.name?.[0].family).toBe('DOE');
    expect(patient?.name?.[0].given?.[0]).toBe('JOHN');

    // Verify Coverage creation
    const coverage = await medplum.searchOne('Coverage', 'subscriber=Patient/' + patient?.id);
    expect(coverage).toBeDefined();
    expect(coverage?.subscriberId?.components?.[0][0]).toBe('123456789A');
    expect(coverage?.payor?.[0].display?.components?.[0][0]).toBe('MEDICARE');

    // Verify Claim creation
    const claim = await medplum.searchOne('Claim', 'patient=Patient/' + patient?.id);
    expect(claim).toBeDefined();
    expect(claim?.insurance?.[0].coverage?.reference).toBe('Coverage/' + coverage?.id);
    expect(claim?.item?.[0].productOrService.coding?.[0].code).toBe('99213');
  });

  test('DFT Message with Multiple Procedures Creates Single Claim', async () => {
    const medplum = new MockClient();
    const bot: Reference<Bot> = { reference: 'Bot/123' };
    const input =
      Hl7Message.parse(`MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||DFT^P03|MSG00002|P|2.3
EVN|P03|20240218153044
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345^USA
FT1|1|ABC123|9876|20240218|20240218|CG|150.00|1|Units|||||||||||||99213^Office Visit^CPT
PR1|1||99213^Office Visit^CPT|20240218|GP
PR1|2||85025^Blood Test^CPT|20240218|GP
IN1|1|BCBS|67890|Blue Cross Blue Shield||||||||||||||||||||||||||||||||XYZ789`);
    const contentType = 'x-application/hl7-v2+er7';
    const secrets = {};
    const result = await handler(medplum, { bot, input, contentType, secrets });

    // Verify Patient creation
    const patient = await medplum.searchOne('Patient', 'identifier=12345');
    expect(patient).toBeDefined();

    // Verify Claim has multiple procedures
    const claim = await medplum.searchOne('Claim', 'patient=Patient/' + patient?.id);
    expect(claim).toBeDefined();
    expect(claim?.item?.length).toBe(2);
    expect(claim?.item?.[0].productOrService.coding?.[0].code).toBe('99213');
    expect(claim?.item?.[1].productOrService.coding?.[0].code).toBe('85025');
  });

  test('Non-DFT Message Type Returns Error', async () => {
    const medplum = new MockClient();
    const bot: Reference<Bot> = { reference: 'Bot/123' };
    const input =
      Hl7Message.parse(`MSH|^~\\&|SENDING_APP|SENDING_FAC|REC_APP|REC_FAC|20240218153044||ADT^A01|MSG00004|P|2.3
EVN|A01|20240218153044
PID|1||12345^^^MRN^MR||DOE^JOHN^A||19800101|M|||123 MAIN ST^^CITY^ST^12345^USA`);
    const contentType = 'x-application/hl7-v2+er7';
    const secrets = {};

    await expect(handler(medplum, { bot, input, contentType, secrets })).rejects.toThrow('Not a DFT message');
  });
});
