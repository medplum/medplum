import { MedplumClient } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';

const medplum = new MedplumClient();

/*
  // start-block searchIncludesCurl
  curl https://api.medplum.com/fhir/R4/Observation?code=78012-2&_include=Observation:patient&_revinclude=Provenance:target
  // end-block searchIncludesCurl
*/

// start-block searchIncludes
await medplum.searchResources('Observation', {
  code: '78012-2',
  _include: 'Observation:patient',
  _revinclude: 'Provenance:target',
});
// end-block searchIncludes

let response: Resource[] =
  // start-block includesResponse
  [
    {
      resourceType: 'Observation',
      id: '1',
      meta: { versionId: 'b267aa05-e134-4f01-817a-5d255a691880', lastUpdated: '2022-12-21T01:55:34.799Z' },
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '260385009', display: 'Negative', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/1', display: 'Homer Simpson III' },
      effectiveDateTime: '2022-11-01T19:33:00.000Z',
    },
    {
      resourceType: 'Patient',
      id: '1',
      meta: {
        versionId: '98a92482-bc3b-4f09-b7ce-08fea48fa135',
        lastUpdated: '2023-03-22T03:05:21.361Z',
      },
      name: [{ given: ['Homer'], family: 'Simpson', suffix: ['III'] }],
      gender: 'male',
      birthDate: '1956-05-12',
    },
    {
      resourceType: 'Provenance',
      id: '1',
      target: [{ reference: 'Observation/1' }],
      agent: [{ who: { reference: 'Practitioner/49d111f2-ae37-47bb-b8ee-2281d024501f' } }],
    },
    {
      resourceType: 'Observation',
      id: '2',
      meta: { versionId: '7777208f-426f-41b1-ab4b-0eb6d3833f09', lastUpdated: '2023-05-01T00:00:00.000Z' },
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '10828004', display: 'Positive', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/1', display: 'Homer Simpson III' },
      effectiveDateTime: '2023-02-04T11:45:00.000Z',
    },
    {
      resourceType: 'Provenance',
      id: '2',
      target: [{ reference: 'Observation/2' }],
      agent: [{ who: { reference: 'Practitioner/49d111f2-ae37-47bb-b8ee-2281d024501f' } }],
    },
    {
      resourceType: 'Observation',
      id: '3',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '260385009', display: 'Negative', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/2', display: 'Lisa Simpson' },
      effectiveDateTime: '2022-06-12T16:03:00.000Z',
      meta: { versionId: 'd4c4e4c7-a867-4b90-afd6-1c2bb84158de', lastUpdated: '2022-12-21T01:55:34.799Z' },
    },
    {
      resourceType: 'Patient',
      id: '2',
      meta: {
        versionId: '98a92482-bc3b-4f09-b7ce-08fea48fa135',
        lastUpdated: '2023-03-22T03:05:21.361Z',
      },
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      gender: 'female',
      birthDate: '2015-08-13',
    },
    {
      resourceType: 'Provenance',
      id: '3',
      target: [{ reference: 'Observation/3' }],
      agent: [{ who: { reference: 'Practitioner/49d111f2-ae37-47bb-b8ee-2281d024501f' } }],
    },
  ];
// end-block includesResponse

/*
  // start-block searchIncludeIterateCurl
  curl https://api.medplum.com/fhir/R4/Observation?code=78012-2&_include=Observation:patient&_include:iterate=Patient:general-practitioner
  // end-block searchIncludeIterateCurl
*/

// start-block searchIncludeIterate
await medplum.searchResources('Observation', {
  code: '78012-2',
  _include: 'Observation:patient',
  '_include:iterate': 'Patient:general-practitioner',
});
// end-block searchIncludeIterate

response =
  // start-block iterateResponse
  [
    {
      resourceType: 'Observation',
      id: '1',
      meta: { versionId: 'b267aa05-e134-4f01-817a-5d255a691880', lastUpdated: '2022-12-21T01:55:34.799Z' },
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '260385009', display: 'Negative', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/1', display: 'Homer Simpson III' },
      effectiveDateTime: '2022-11-01T19:33:00.000Z',
    },
    {
      resourceType: 'Patient',
      id: '1',
      meta: { versionId: '98a92482-bc3b-4f09-b7ce-08fea48fa135', lastUpdated: '2023-03-22T03:05:21.361Z' },
      name: [{ given: ['Homer'], family: 'Simpson', suffix: ['III'] }],
      gender: 'male',
      birthDate: '1956-05-12',
      generalPractitioner: [{ reference: 'Practitioner/1' }],
    },
    {
      resourceType: 'Practitioner',
      id: '1',
      name: [{ prefix: ['Dr.'], given: ['Julius', 'Michael'], family: 'Hibbert', suffix: ['M.D.'] }],
      identifier: [{ system: 'http://hl7.org/fhir/sid/us-npi', value: '3141592654' }],
    },
    {
      resourceType: 'Observation',
      id: '2',
      meta: { versionId: '7777208f-426f-41b1-ab4b-0eb6d3833f09', lastUpdated: '2023-05-01T00:00:00.000Z' },
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '10828004', display: 'Positive', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/1', display: 'Homer Simpson III' },
      effectiveDateTime: '2023-02-04T11:45:00.000Z',
    },
    {
      resourceType: 'Observation',
      id: '3',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '78012-2', display: 'Streptococcus pyogenes antigen, Throat' }],
      },
      valueCodeableConcept: {
        coding: [{ code: '260385009', display: 'Negative', system: 'http://snomed.info/sct' }],
      },
      subject: { reference: 'Patient/2', display: 'Lisa Simpson' },
      effectiveDateTime: '2022-06-12T16:03:00.000Z',
      meta: { versionId: 'd4c4e4c7-a867-4b90-afd6-1c2bb84158de', lastUpdated: '2022-12-21T01:55:34.799Z' },
    },
    {
      resourceType: 'Patient',
      id: '2',
      meta: {
        versionId: '98a92482-bc3b-4f09-b7ce-08fea48fa135',
        lastUpdated: '2023-03-22T03:05:21.361Z',
      },
      name: [{ given: ['Lisa'], family: 'Simpson' }],
      gender: 'female',
      birthDate: '2015-08-13',
      generalPractitioner: [{ reference: 'Practitioner/1' }],
    },
  ];
// end-block iterateResponse

console.log(response); // Needed to make the example compile, so `response` isn't unused
