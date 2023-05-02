import { MedplumClient } from '@medplum/core';
import { Bundle, Resource } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

// start-block searchInclude
await medplum.search('Observation', {
  code: 'http://loinc.org|78012-2',
  _include: 'Observation:patient',
  '_include:iterate': 'Patient:link',
});
// end-block searchInclude

const response: Bundle<Resource> =
  // start-block includeResponse
  {
    resourceType: 'Bundle',
    type: 'searchset',
    entry: [
      {
        fullUrl: 'https://api.medplum.com/fhir/R4/Observation/1dae1867-a7ba-4bb8-b0b3-5709274f0381',
        resource: {
          resourceType: 'Observation',
          status: 'final',
          code: { coding: [{ system: 'http://loinc.org', code: '41793-1', display: 'Abdomen X-ray during surgery' }] },
          subject: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
          performer: [
            { reference: 'Practitioner/65f1ef35-4dd5-4dd5-823f-bb5d94e4768e', display: 'Dr. Jaunita130 Armstrong51' },
          ],
          effectiveDateTime: '2022-11-01T19:33:00.000Z',
          id: '1dae1867-a7ba-4bb8-b0b3-5709274f0381',
          meta: { versionId: 'b267aa05-e134-4f01-817a-5d255a691880', lastUpdated: '2022-12-21T01:55:34.799Z' },
        },
      },
      {
        fullUrl: 'https://api.medplum.com/fhir/R4/Patient/e8585ae6-921f-415f-984e-dc5695de0e36',
        resource: {
          resourceType: 'Patient',
          name: [{ given: ['Homer'], family: 'Simpson', suffix: ['III'] }],
          gender: 'male',
          id: 'e8585ae6-921f-415f-984e-dc5695de0e36',
          meta: {
            profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
            versionId: '98a92482-bc3b-4f09-b7ce-08fea48fa135',
            lastUpdated: '2023-03-22T03:05:21.361Z',
          },
          birthDate: '1956-05-12',
          link: [
            {
              other: {
                reference: 'RelatedPerson/1616af2d-a81c-4a07-8939-11607a91732a',
                display: 'Marge Jacqueline Simpson',
              },
              type: 'seealso',
            },
            {
              other: { reference: 'RelatedPerson/32703da8-c9e3-462f-b346-cfabbcecc4ad', display: 'Lisa Simpson' },
              type: 'seealso',
            },
          ],
        },
      },
      {
        fullUrl: 'https://api.medplum.com/fhir/R4/RelatedPerson/1616af2d-a81c-4a07-8939-11607a91732a',
        resource: {
          resourceType: 'RelatedPerson',
          patient: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
          relationship: [
            {
              text: 'wife',
              coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'WIFE', display: 'WIFE' }],
            },
          ],
          name: [
            {
              given: ['Marge', 'Jacqueline'],
              family: 'Simpson',
              period: { start: '1980-01-01T00:00:00Z' },
              use: 'official',
            },
            {
              given: ['Marge', 'Jacqueline'],
              family: 'née Bouvier',
              period: { end: '1980-01-01T00:00:00Z' },
              use: 'old',
            },
          ],
          gender: 'female',
          id: '1616af2d-a81c-4a07-8939-11607a91732a',
          active: true,
          meta: { versionId: '8872379e-b991-49cf-a2ce-fe5512ad7b54', lastUpdated: '2022-12-16T22:10:44.450Z' },
        },
      },
      {
        fullUrl: 'https://api.medplum.com/fhir/R4/RelatedPerson/32703da8-c9e3-462f-b346-cfabbcecc4ad',
        resource: {
          resourceType: 'RelatedPerson',
          patient: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
          relationship: [
            {
              coding: [
                { system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'DAUC', display: 'daughter' },
              ],
            },
          ],
          id: '32703da8-c9e3-462f-b346-cfabbcecc4ad',
          meta: { versionId: 'fc707ca4-777e-436b-a69c-d36425909553', lastUpdated: '2023-03-22T03:04:51.510Z' },
          name: [{ given: ['Lisa'], family: 'Simpson' }],
        },
      },
    ],
    link: [
      { relation: 'self', url: 'https://api.medplum.com/fhir/R4/Observation?_count=1' },
      { relation: 'first', url: 'https://api.medplum.com/fhir/R4/Observation?_count=1&_offset=0' },
      { relation: 'next', url: 'https://api.medplum.com/fhir/R4/Observation?_count=1&_offset=1' },
    ],
  };
// end-block includeResponse

console.log(response); // Needed to make the example compile, so `response` isn't unused
