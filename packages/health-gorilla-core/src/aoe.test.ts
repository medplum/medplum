import { Bundle, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { getMissingRequiredQuestionnaireItems } from './aoe';
import { indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';

type AoeTestingLinkId =
  | 'date'
  | 'fasting'
  | 'specimen-source'
  | 'additional-testing'
  | 'medications'
  | 'family-history'
  | 'translator';
function generateAoeTestingQuestionnaire(): Questionnaire {
  // Questionnaire from HGDX LabCorp (f-388554647b89801ea5e8320b), AOE Testing (aoe_testing) test
  return {
    resourceType: 'Questionnaire',
    id: 'ed364266b937bb3bd73082b1',
    name: 'AOE Testing AOE questions',
    status: 'active',
    subjectType: ['Patient'],
    code: [
      {
        system: 'urn:uuid:f:388554647b89801ea5e8320b',
        code: 'aoe_testing',
      },
    ],
    item: [
      {
        id: 'date',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'localDate',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'date',
          },
        ],
        text: 'What is the date?',
        type: 'date',
        linkId: 'date',
      },
      {
        id: 'fasting',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'dropdown',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'fasting',
          },
        ],
        text: 'Is the patient fasting?',
        type: 'choice',
        required: true,
        answerOption: [
          {
            valueCoding: {
              code: 'Y',
              display: 'Yes',
            },
          },
          {
            valueCoding: {
              code: 'N',
              display: 'No',
            },
          },
        ],
        linkId: 'fasting',
      },
      {
        id: 'specimen-source',
        extension: [
          {
            url: 'https://www.healthgorilla.com/fhir/StructureDefinition/questionnaire-requiredwhenspecimen',
            valueBoolean: true,
          },
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'editableDropdown',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'specimen-source',
          },
        ],
        text: 'Source of specimen',
        type: 'open-choice',
        answerOption: [
          {
            valueCoding: {
              code: 'U',
              display: 'Urine',
            },
          },
          {
            valueCoding: {
              code: 'B',
              display: 'Blood',
            },
          },
          {
            valueCoding: {
              code: 'S',
              display: 'Saliva',
            },
          },
        ],
        linkId: 'specimen-source',
      },
      {
        id: 'additional-testing',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'radioButtons',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'additional-testing',
          },
        ],
        text: 'Do you need additional testing?',
        type: 'choice',
        answerOption: [
          {
            valueCoding: {
              code: 'Y',
              display: 'Yes',
            },
          },
          {
            valueCoding: {
              code: 'N',
              display: 'No',
            },
          },
        ],
        linkId: 'additional-testing',
      },
      {
        id: 'medications',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'multiselect',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'medications',
          },
        ],
        text: 'What medications is the patient taking?',
        type: 'choice',
        repeats: true,
        answerOption: [
          {
            valueCoding: {
              code: 'T',
              display: 'Tylenol',
            },
          },
          {
            valueCoding: {
              code: 'A1',
              display: 'Advil',
            },
          },
          {
            valueCoding: {
              code: 'A2',
              display: 'Aleve',
            },
          },
        ],
        linkId: 'medications',
      },
      {
        id: 'family-history',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'textBox',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'family-history',
          },
        ],
        text: 'Family history',
        type: 'string',
        linkId: 'family-history',
      },
      {
        id: 'translator',
        extension: [
          {
            url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
            valueCodeableConcept: {
              coding: [
                {
                  code: 'checkBox',
                },
              ],
            },
          },
        ],
        code: [
          {
            code: 'translator',
          },
        ],
        text: 'Does the patient need translator services?',
        type: 'choice',
        linkId: 'translator',
      },
    ],
  };
}

type QuestionnaireResponseWithLinkIds<LinkId extends string> = QuestionnaireResponse & { item: { linkId: LinkId }[] };

describe('getMissingRequiredQuestionnaireItems', () => {
  beforeAll(() => {
    indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  });

  test('AOE Testing Questionnaire with no answers', () => {
    const q = generateAoeTestingQuestionnaire();
    const qr: QuestionnaireResponseWithLinkIds<AoeTestingLinkId> = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [],
    };
    const missing = getMissingRequiredQuestionnaireItems(q, qr, false);
    expect(missing).toEqual(['fasting']);
  });

  test('AOE Testing Questionnaire with answers', () => {
    const q = generateAoeTestingQuestionnaire();
    const qr: QuestionnaireResponseWithLinkIds<AoeTestingLinkId> = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'fasting',
          answer: [
            {
              valueCoding: {
                code: 'Y',
                display: 'Yes',
              },
            },
          ],
        },
      ],
    };
    const missing = getMissingRequiredQuestionnaireItems(q, qr, false);
    expect(missing).toEqual([]);
  });

  test('AOE Testing Questionnaire with requiredwhenspecimen with some answers', () => {
    const q = generateAoeTestingQuestionnaire();
    const qr: QuestionnaireResponseWithLinkIds<AoeTestingLinkId> = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'fasting',
          answer: [
            {
              valueCoding: {
                code: 'Y',
                display: 'Yes',
              },
            },
          ],
        },
      ],
    };
    const missing = getMissingRequiredQuestionnaireItems(q, qr, true);
    expect(missing).toEqual(['specimen-source']);
  });

  test('AOE Testing Questionnaire with requiredwhenspecimen with some answers', () => {
    const q = generateAoeTestingQuestionnaire();
    const qr: QuestionnaireResponseWithLinkIds<AoeTestingLinkId> = {
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'fasting',
          answer: [
            {
              valueCoding: {
                code: 'Y',
                display: 'Yes',
              },
            },
          ],
        },
        {
          linkId: 'specimen-source',
          answer: [
            {
              valueCoding: {
                code: 'S',
                display: 'Saliva',
              },
            },
          ],
        },
      ],
    };
    const missing = getMissingRequiredQuestionnaireItems(q, qr, true);
    expect(missing).toEqual([]);
  });
});
