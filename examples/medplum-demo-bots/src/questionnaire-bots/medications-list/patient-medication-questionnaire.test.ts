import { RXNORM, createReference } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { DrAliceSmith, HomerSimpson, MockClient } from '@medplum/mock';
import { expect, test } from 'vitest';
import { handler } from './patient-medication-questionnaire';

const contentType = 'application/fhir+json';
// npm t src/examples/questionnaire-bots/medications-list/patient-medication-questionnaire.test.ts
test('Success', async () => {
  const medplum = new MockClient();
  const quesionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    name: 'Common Medications Questionnaire',
    title: 'A Questionnaire for Patients to fill out pre-visit',
    status: 'active',
    subjectType: ['Patient'],
    item: [
      {
        linkId: 'medications',
        text: 'Please indicate whether you are currently taking any of the following common medications:',
        type: 'group',
        item: [
          {
            linkId: '161',
            text: 'Acetaminophen (Tylenol)',
            type: 'boolean',
            code: [
              {
                system: RXNORM,
                code: '161',
                display: 'Acetaminophen',
              },
            ],
          },
          {
            linkId: '1191',
            text: 'Aspirin',
            type: 'boolean',
            code: [
              {
                system: RXNORM,
                code: '1191',
                display: 'Aspirin',
              },
            ],
          },
          {
            linkId: '81906',
            text: 'Atorvastatin (Lipitor)',
            type: 'boolean',
            code: [
              {
                system: RXNORM,
                code: '81906',
                display: 'Atorvastatin',
              },
            ],
          },
          {
            linkId: '860258',
            text: 'Metformin (Glucophage)',
            type: 'boolean',
            code: [
              {
                system: RXNORM,
                code: '860258',
                display: 'Metformin',
              },
            ],
          },
          {
            linkId: '103258',
            text: 'Lisinopril (Zestril)',
            type: 'boolean',
            code: [
              {
                system: RXNORM,
                code: '103258',
                display: 'Lisinopril',
              },
            ],
          },
        ],
      },
    ],
  };

  const questionnaire = await medplum.createResource(quesionnaire);

  const input: QuestionnaireResponse = {
    resourceType: 'QuestionnaireResponse',
    item: [
      {
        linkId: 'medications',
        text: 'Please indicate whether you are currently taking any of the following common medications:',
        item: [
          {
            linkId: '161',
            text: 'Acetaminophen (Tylenol)',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            linkId: '1191',
            text: 'Aspirin',
          },
          {
            linkId: 'lipitor',
            text: 'Atorvastatin (Lipitor)',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            linkId: 'metformin',
            text: 'Metformin (Glucophage)',
          },
          {
            linkId: 'lisinopril',
            text: 'Lisinopril (Zestril)',
          },
        ],
      },
    ],
    questionnaire: createReference(questionnaire).reference,
    subject: createReference(HomerSimpson),
    source: createReference(DrAliceSmith),
    authored: '2023-03-19T18:07:45.750Z',
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
