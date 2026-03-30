// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// start-block imports
import { MedplumClient } from '@medplum/core';

// end-block imports

const medplum = new MedplumClient();

// start-block createEpisodeOfCareTs
const episode = await medplum.createResource({
  resourceType: 'EpisodeOfCare',
  status: 'active',
  patient: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  type: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/episodeofcare-type',
          code: 'hacc',
          display: 'Home and Community Care',
        },
      ],
    },
  ],
  diagnosis: [
    {
      condition: {
        reference: 'Condition/diabetes-type-2',
        display: 'Type 2 Diabetes Mellitus',
      },
      role: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
            code: 'CC',
            display: 'Chief complaint',
          },
        ],
      },
    },
  ],
  period: {
    start: '2024-01-15',
  },
  managingOrganization: {
    reference: 'Organization/springfield-clinic',
    display: 'Springfield Medical Clinic',
  },
});
console.log(episode);
// end-block createEpisodeOfCareTs

// start-block createEncounterTs
const encounter = await medplum.createResource({
  resourceType: 'Encounter',
  status: 'finished',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
    display: 'ambulatory',
  },
  subject: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  episodeOfCare: [
    { reference: 'EpisodeOfCare/diabetes-episode' },
    { reference: 'EpisodeOfCare/weight-loss-episode' },
  ],
  period: {
    start: '2024-06-01T09:00:00Z',
    end: '2024-06-01T09:30:00Z',
  },
});
console.log(encounter);
// end-block createEncounterTs

// start-block createGoalTs
const goal = await medplum.createResource({
  resourceType: 'Goal',
  lifecycleStatus: 'active',
  description: {
    text: 'Maintain HbA1c below 7%',
  },
  subject: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  target: [
    {
      measure: {
        coding: [
          {
            system: 'http://loinc.org',
            code: '4548-4',
            display: 'Hemoglobin A1c/Hemoglobin.total in Blood',
          },
        ],
      },
      detailQuantity: {
        value: 7,
        unit: '%',
        system: 'http://unitsofmeasure.org',
        code: '%',
      },
    },
  ],
});
console.log(goal);
// end-block createGoalTs

// start-block createCarePlanTs
const carePlan = await medplum.createResource({
  resourceType: 'CarePlan',
  status: 'active',
  intent: 'plan',
  title: 'Diabetes Management Plan',
  subject: {
    reference: 'Patient/homer-simpson',
    display: 'Homer Simpson',
  },
  addresses: [
    {
      reference: 'Condition/diabetes-type-2',
      display: 'Type 2 Diabetes Mellitus',
    },
  ],
  goal: [
    {
      reference: 'Goal/hba1c-goal',
      display: 'Maintain HbA1c below 7%',
    },
  ],
  activity: [
    {
      detail: {
        kind: 'ServiceRequest',
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '4548-4',
              display: 'Hemoglobin A1c',
            },
          ],
        },
        description: 'Quarterly HbA1c lab test',
        status: 'scheduled',
        scheduledPeriod: {
          start: '2024-07-01',
        },
      },
    },
  ],
  supportingInfo: [
    {
      reference: 'EpisodeOfCare/diabetes-episode',
      display: 'Diabetes Management Episode',
    },
  ],
});
console.log(carePlan);
// end-block createCarePlanTs

// start-block searchEncountersByEpisodeTs
const encounters = await medplum.searchResources(
  'Encounter',
  'episode-of-care=EpisodeOfCare/diabetes-episode'
);
console.log(encounters);
// end-block searchEncountersByEpisodeTs

/*
// start-block searchEncountersByEpisodeCli
medplum get 'Encounter?episode-of-care=EpisodeOfCare/diabetes-episode'
// end-block searchEncountersByEpisodeCli

// start-block searchEncountersByEpisodeCurl
curl 'https://api.medplum.com/fhir/R4/Encounter?episode-of-care=EpisodeOfCare/diabetes-episode' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block searchEncountersByEpisodeCurl
*/

// start-block searchCarePlansByConditionTs
const carePlans = await medplum.searchResources(
  'CarePlan',
  'patient=Patient/homer-simpson&condition=Condition/diabetes-type-2'
);
console.log(carePlans);
// end-block searchCarePlansByConditionTs

/*
// start-block searchCarePlansByConditionCli
medplum get 'CarePlan?patient=Patient/homer-simpson&condition=Condition/diabetes-type-2'
// end-block searchCarePlansByConditionCli

// start-block searchCarePlansByConditionCurl
curl 'https://api.medplum.com/fhir/R4/CarePlan?patient=Patient/homer-simpson&condition=Condition/diabetes-type-2' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block searchCarePlansByConditionCurl
*/

// start-block searchEpisodesByPatientTs
const episodes = await medplum.searchResources(
  'EpisodeOfCare',
  'patient=Patient/homer-simpson&status=active'
);
console.log(episodes);
// end-block searchEpisodesByPatientTs

/*
// start-block searchEpisodesByPatientCli
medplum get 'EpisodeOfCare?patient=Patient/homer-simpson&status=active'
// end-block searchEpisodesByPatientCli

// start-block searchEpisodesByPatientCurl
curl 'https://api.medplum.com/fhir/R4/EpisodeOfCare?patient=Patient/homer-simpson&status=active' \
  -H 'authorization: Bearer $ACCESS_TOKEN' \
  -H 'content-type: application/fhir+json'
// end-block searchEpisodesByPatientCurl
*/
