import { decodeBase64, indexSearchParameterBundle, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson, SEARCH_PARAMETER_BUNDLE_FILES } from '@medplum/definitions';
import { Bundle, Claim, DocumentReference, SearchParameter } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { handler } from './cms-1500';
import { fullAnswer } from './cms-1500-test-data';

const medplum = new MockClient();

describe('CMS 1500 tests', async () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
    for (const filename of SEARCH_PARAMETER_BUNDLE_FILES) {
      indexSearchParameterBundle(readJson(filename) as Bundle<SearchParameter>);
    }
  });

  test('Fully answered CMS1500', async () => {
    const result = await medplum.executeBatch(fullAnswer);
    console.log(result);
    const claim = (await medplum.searchOne('Claim', {
      identifier: 'example-claim-cms1500',
    })) as Claim;

    const response = await handler(medplum, {
      bot: { reference: 'Bot/123' },
      input: claim,
      secrets: {},
      contentType: 'application/fhir+json',
    });

    expect(response).toBeDefined();
    expect(response.resourceType).toBe('DocumentReference');

    const DocumentReference = response as DocumentReference;
    const attachment = DocumentReference.content?.[0]?.attachment;

    const binaryId = attachment?.url?.split('/').pop();
    const binary = await medplum.readResource('Binary', binaryId as string);
    expect(binary).toBeDefined();
    expect(binary.data).toBeDefined();

    const str = decodeBase64(binary.data as string);
    const expected = `2,Patient's Name,Full name of the patient,Homer Simpson
3,Patient's Birth Date,Date of birth of patient,5/12/1956
3,Patient's Sex,Gender of the patient,male
4,Insured's Name,Full name of the insured person,Marge Simpson
5,Patient's Address,Address of the patient,742 Evergreen Terrace, Springfield, IL, 62704
6,Patient Relationship to Insured,Relationship of the patient to the insured,Spouse
7,Insured's Address,Address of the insured person,742 Evergreen Terrace, Springfield, IL, 62704`;
    expect(str.includes(expected)).toBe(true);
  });
});
