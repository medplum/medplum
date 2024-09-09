import { SNOMED, createReference, getReferenceString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './conditions-list-questionnaire';

const contentType = 'application/fhir+json';
// npm t src/examples/questionnaire-bots/conditions-list/conditions-list-questionnaire.test.ts
test('Success', async () => {
  const medplum = new MockClient();
  const quesionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    name: 'Conditions List or Problem List',
    title: 'A Questionnaire for collecting a list of conditions or problems',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        linkId: 'conditions',
        text: 'Please indicate whether the patient reports any of the following medical conditions:',
        type: 'group',
        item: [
          {
            linkId: '38341003',
            text: 'Hypertension',
            type: 'boolean',
            code: [
              {
                system: SNOMED,
                code: '38341003',
                display: 'Hypertension',
              },
            ],
          },
          {
            linkId: '44054006',
            text: 'Type 2 diabetes',
            type: 'boolean',
            code: [
              {
                system: SNOMED,
                code: '44054006',
                display: 'Type 2 diabetes',
              },
            ],
          },
          {
            linkId: '414915002',
            text: 'Obesity',
            type: 'boolean',
            code: [
              {
                system: SNOMED,
                code: '414915002',
                display: 'Obesity',
              },
            ],
          },
          {
            linkId: '195967001',
            text: 'Asthma',
            type: 'boolean',
            code: [
              {
                system: SNOMED,
                code: '195967001',
                display: 'Asthma',
              },
            ],
          },
        ],
      },
    ],
  };

  const questionnaire = await medplum.createResource(quesionnaire);

  const encounter = await medplum.createResource({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { code: 'ambulatory' },
    subject: createReference(HomerSimpson),
    participant: [{ individual: createReference(DrAliceSmith) }], // Dr. Alice Smith is the Practitioner who performed the encounter
  });

  const input: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    item: [
      {
        linkId: 'conditions',
        text: 'Please indicate whether the patient reports any of the following medical conditions::',
        item: [
          {
            linkId: '44054006',
            text: 'Type 2 Diabetes',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
        ],
      },
    ],
    questionnaire: getReferenceString(questionnaire),
    subject: createReference(HomerSimpson),
    encounter: createReference(encounter),
    source: createReference(DrAliceSmith),
    authored: new Date().toISOString(),
    status: 'completed',
  };
  const result = await handler(medplum, {
    bot: { reference: 'Bot/123' },
    input,
    contentType,
    secrets: {},
  });
  expect(result).toBe(true);
});
