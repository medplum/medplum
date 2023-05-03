import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

// start-block searchInclude
await medplum.searchResources('Observation', {
  code: 'http://loinc.org|78012-2',
  _include: 'Observation:patient',
  '_include:iterate': 'Patient:link',
});
// end-block searchInclude

let response: Resource[] =
  // start-block includeResponse
  [
    {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '260385009',
            display: 'Negative',
          },
        ],
      },
      subject: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
      performer: [
        { reference: 'Practitioner/65f1ef35-4dd5-4dd5-823f-bb5d94e4768e', display: 'Dr. Jaunita130 Armstrong51' },
      ],
      effectiveDateTime: '2022-11-01T19:33:00.000Z',
      id: '1dae1867-a7ba-4bb8-b0b3-5709274f0381',
      meta: { versionId: 'b267aa05-e134-4f01-817a-5d255a691880', lastUpdated: '2022-12-21T01:55:34.799Z' },
    },
    {
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
    {
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
    {
      resourceType: 'RelatedPerson',
      patient: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
      relationship: [
        {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: 'DAUC', display: 'daughter' }],
        },
      ],
      id: '32703da8-c9e3-462f-b346-cfabbcecc4ad',
      meta: { versionId: 'fc707ca4-777e-436b-a69c-d36425909553', lastUpdated: '2023-03-22T03:04:51.510Z' },
      name: [{ given: ['Lisa'], family: 'Simpson' }],
    },
  ];
// end-block includeResponse

// start-block searchRevinclude
await medplum.searchResources('Observation', {
  code: 'http://loinc.org|78012-2',
  _revinclude: 'Provenance:target',
});
// end-block searchRevinclude

response =
  // start-block revincludeResponse
  [
    {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '260385009',
            display: 'Negative',
          },
        ],
      },
      subject: { reference: 'Patient/e8585ae6-921f-415f-984e-dc5695de0e36', display: 'Homer Simpson III' },
      performer: [
        { reference: 'Practitioner/65f1ef35-4dd5-4dd5-823f-bb5d94e4768e', display: 'Dr. Jaunita130 Armstrong51' },
      ],
      effectiveDateTime: '2022-11-01T19:33:00.000Z',
      id: '1dae1867-a7ba-4bb8-b0b3-5709274f0381',
      meta: { versionId: 'b267aa05-e134-4f01-817a-5d255a691880', lastUpdated: '2022-12-21T01:55:34.799Z' },
    },
    {
      resourceType: 'Provenance',
      target: [{ reference: 'Observation/1dae1867-a7ba-4bb8-b0b3-5709274f0381' }],
      recorded: '2022-12-17T20:36:01.656Z',
      agent: [
        {
          who: { reference: 'Practitioner/a1b522be-02f8-4f0f-928f-39702234824c', display: 'Reshma Khilnani' },
          type: {
            coding: [{ system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type', code: 'author' }],
          },
          onBehalfOf: {
            reference: 'Organization/4657f8f1-91df-486f-ab62-9d766393f8a0',
            display: 'Brockton Hospital',
          },
        },
      ],
      id: '817460a3-20cb-425c-8d05-0747f1b5ec3a',
      meta: { versionId: '297c919e-1369-43e1-9d43-64ec95383690', lastUpdated: '2022-12-21T02:08:07.696Z' },
    },
  ];
// end-block revincludeResponse

console.log(response); // Needed to make the example compile, so `response` isn't unused
