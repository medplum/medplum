// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getQuestionnaireAnswers } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, QuestionnaireForm } from '@medplum/react';
import { JSX, useState } from 'react';

export function ScreeningQuestionnairePage(): JSX.Element {
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);
    console.log(answers);
    setIsSubmitted(true);
    window.scrollTo(0, 0);
  }

  return (
    <Document width={800}>
      {isSubmitted ? (
        <div>Thank you for submitting your questions</div>
      ) : (
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleQuestionnaireSubmit} />
      )}
    </Document>
  );
}

const questionnaire: Questionnaire = {
  id: 'lforms-ahn-hrsn-screening',
  meta: {
    versionId: '1',
    lastUpdated: '2022-07-03T03:13:00.000-04:00',
    source: '#bI9JAV8DuxZjLXqa',
    profile: ['http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire|2.7'],
    tag: [
      {
        code: 'lformsVersion: 30.3.0',
      },
    ],
  },
  language: 'en-US',
  extension: [],
  subjectType: ['Patient'],
  status: 'draft',
  experimental: true,
  publisher: 'Center for Medicare and Medicaid Services',
  copyright: 'Public Domain',
  url: 'http://lforms-fhir.nlm.nih.gov/baseR4',
  name: 'AHC HRSN Screening',
  title: 'AHC HRSN Screening',
  resourceType: 'Questionnaire',
  item: [
    {
      type: 'group',
      code: [
        {
          system: 'Custom',
          code: 'coreQuestions',
          display: 'AHC HRSN Screening Core Questions',
        },
      ],
      required: false,
      linkId: '/coreQuestions',
      text: 'AHC HRSN Screening Core Questions',
      prefix: 'I:',
      item: [
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'livingSituation',
              display: 'Living Situation',
            },
          ],
          required: false,
          linkId: '/coreQuestions/livingSituation',
          text: 'Living Situation',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '1',
                  display: 'What is your living situation today?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/livingSituation/1',
              text: 'What is your living situation today?',
              prefix: '1.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: '1a1',
                    display: 'I have a steady place to live',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: '1a2',
                    display: 'I have a place to live today, but I am worried about losing it in the future',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: '1a3',
                    display:
                      'I do not have a steady place to live (I am temporarily staying with others, in a hotel, in a shelter, living outside on the street, on a beach, in a car, abandoned building, bus or train station, or in a park)',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '2',
                  display: 'Think about the place you live. Do you have problems with any of the following?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              repeats: true,
              linkId: '/coreQuestions/livingSituation/2',
              text: 'Think about the place you live. Do you have problems with any of the following?',
              prefix: '2.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: '2a1',
                    display: 'Pests such as bugs, ants, or mice',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: '2a2',
                    display: 'Mold',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: '2a3',
                    display: 'Lead paint or pipes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: '2a4',
                    display: 'Lack of heat',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: '2a5',
                    display: 'Oven or stove not working',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '6*',
                    },
                  ],
                  valueCoding: {
                    code: '2a6',
                    display: 'Smoke detectors missing or not working',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '7*',
                    },
                  ],
                  valueCoding: {
                    code: '2a7',
                    display: 'Water leaks',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '8',
                    },
                  ],
                  valueCoding: {
                    code: '2a8',
                    display: 'None of the above',
                  },
                },
              ],
              item: [
                {
                  text: 'CHOOSE ALL THAT APPLY',
                  type: 'display',
                  linkId: '/coreQuestions/livingSituation/2-help',
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                      valueCodeableConcept: {
                        text: 'Help-Button',
                        coding: [
                          {
                            code: 'help',
                            display: 'Help-Button',
                            system: 'http://hl7.org/fhir/questionnaire-item-control',
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'food',
              display: 'Food',
            },
          ],
          required: false,
          linkId: '/coreQuestions/food',
          text: 'Food',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '3',
                  display:
                    'Within the past 12 months, you worried that your food would run out before you got money to buy more.',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/food/3',
              text: 'Within the past 12 months, you worried that your food would run out before you got money to buy more.',
              prefix: '3.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: 'oTrue',
                    display: 'Often true',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'sTrue',
                    display: 'Sometimes true',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3',
                    },
                  ],
                  valueCoding: {
                    code: 'nTrue',
                    display: 'Never true',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '4',
                  display:
                    "Within the past 12 months, the food you bought just didn't last and you didn't have money to get more.",
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/food/4',
              text: "Within the past 12 months, the food you bought just didn't last and you didn't have money to get more.",
              prefix: '4.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: 'oTrue',
                    display: 'Often true',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'sTrue',
                    display: 'Sometimes true',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3',
                    },
                  ],
                  valueCoding: {
                    code: 'nTrue',
                    display: 'Never true',
                  },
                },
              ],
            },
            {
              text: 'Some people have made the following statements about their food situation. Please answer whether the statements were OFTEN, SOMETIMES, or NEVER true for you and your household in the last 12 months.',
              type: 'display',
              linkId: '/coreQuestions/food-help',
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    text: 'Help-Button',
                    coding: [
                      {
                        code: 'help',
                        display: 'Help-Button',
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'transportation',
              display: 'Transportation',
            },
          ],
          required: false,
          linkId: '/coreQuestions/transportation',
          text: 'Transportation',
          item: [
            {
              type: 'boolean',
              code: [
                {
                  system: 'Custom',
                  code: '5',
                  display:
                    'In the past 12 months, has lack of reliable transportation kept you from medical appointments, meetings, work or from getting things needed for daily living?',
                },
              ],
              required: false,
              linkId: '/coreQuestions/transportation/5',
              text: 'In the past 12 months, has lack of reliable transportation kept you from medical appointments, meetings, work or from getting things needed for daily living?',
              prefix: '5.',
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'utilities',
              display: 'Utilities',
            },
          ],
          required: false,
          linkId: '/coreQuestions/utilities',
          text: 'Utilities',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '6',
                  display:
                    'In the past 12 months has the electric, gas, oil, or water company threatened to shut off services in your home?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/utilities/6',
              text: 'In the past 12 months has the electric, gas, oil, or water company threatened to shut off services in your home?',
              prefix: '6.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: 'bTrue',
                    display: 'Yes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2',
                    },
                  ],
                  valueCoding: {
                    code: 'bFalse',
                    display: 'No',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: 'alreadyShutOff',
                    display: 'Already shut off',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'safety',
              display: 'Safety',
            },
          ],
          required: false,
          linkId: '/coreQuestions/safety',
          text: 'Safety',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '7',
                  display: 'How often does anyone, including family and friends, physically hurt you?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/safety/7',
              text: 'How often does anyone, including family and friends, physically hurt you?',
              prefix: '7.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                  valueCoding: {
                    code: 'fr1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                  valueCoding: {
                    code: 'fr2',
                    display: 'Rarely',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                  valueCoding: {
                    code: 'fr3',
                    display: 'Sometimes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 4,
                    },
                  ],
                  valueCoding: {
                    code: 'fr4',
                    display: 'Fairly often',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 5,
                    },
                  ],
                  valueCoding: {
                    code: 'fr5',
                    display: 'Frequently',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '8',
                  display: 'How often does anyone, including family and friends, insult or talk down to you?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/safety/8',
              text: 'How often does anyone, including family and friends, insult or talk down to you?',
              prefix: '8.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                  valueCoding: {
                    code: 'fr1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                  valueCoding: {
                    code: 'fr2',
                    display: 'Rarely',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                  valueCoding: {
                    code: 'fr3',
                    display: 'Sometimes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 4,
                    },
                  ],
                  valueCoding: {
                    code: 'fr4',
                    display: 'Fairly often',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 5,
                    },
                  ],
                  valueCoding: {
                    code: 'fr5',
                    display: 'Frequently',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '9',
                  display: 'How often does anyone, including family and friends, threaten you with harm?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/safety/9',
              text: 'How often does anyone, including family and friends, threaten you with harm?',
              prefix: '9.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                  valueCoding: {
                    code: 'fr1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                  valueCoding: {
                    code: 'fr2',
                    display: 'Rarely',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                  valueCoding: {
                    code: 'fr3',
                    display: 'Sometimes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 4,
                    },
                  ],
                  valueCoding: {
                    code: 'fr4',
                    display: 'Fairly often',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 5,
                    },
                  ],
                  valueCoding: {
                    code: 'fr5',
                    display: 'Frequently',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '10',
                  display: 'How often does anyone, including family and friends, scream or curse at you?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/coreQuestions/safety/10',
              text: 'How often does anyone, including family and friends, scream or curse at you?',
              prefix: '10.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 1,
                    },
                  ],
                  valueCoding: {
                    code: 'fr1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 2,
                    },
                  ],
                  valueCoding: {
                    code: 'fr2',
                    display: 'Rarely',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 3,
                    },
                  ],
                  valueCoding: {
                    code: 'fr3',
                    display: 'Sometimes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 4,
                    },
                  ],
                  valueCoding: {
                    code: 'fr4',
                    display: 'Fairly often',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                      valueDecimal: 5,
                    },
                  ],
                  valueCoding: {
                    code: 'fr5',
                    display: 'Frequently',
                  },
                },
              ],
            },
            {
              type: 'string',
              code: [
                {
                  system: 'Custom',
                  code: 'safetyScore',
                  display: 'Safety score',
                },
              ],
              required: false,
              linkId: '/coreQuestions/safety/safetyScore',
              text: 'Safety score',
              readOnly: true,
              item: [
                {
                  text: 'A score of 11 or more when the numerical values for answers to questions 7-10 are added shows that the person might not be safe.',
                  type: 'display',
                  linkId: '/coreQuestions/safety/safetyScore-help',
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                      valueCodeableConcept: {
                        text: 'Help-Button',
                        coding: [
                          {
                            code: 'help',
                            display: 'Help-Button',
                            system: 'http://hl7.org/fhir/questionnaire-item-control',
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              text: 'Because violence and abuse happens to a lot of people and affects their health we are asking the following questions. A score of 11 or more when the numerical values for answers to the questions are added shows that the person might not be safe.',
              type: 'display',
              linkId: '/coreQuestions/safety-help',
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    text: 'Help-Button',
                    coding: [
                      {
                        code: 'help',
                        display: 'Help-Button',
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        {
          text: 'If someone chooses the asterisk (*) answers, they might have an unmet health-related social need.',
          type: 'display',
          linkId: '/coreQuestions-help',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                text: 'Help-Button',
                coding: [
                  {
                    code: 'help',
                    display: 'Help-Button',
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      code: [
        {
          system: 'Custom',
          code: 'supplementalQuestions',
          display: 'AHC HRSN Screening Supplemental Questions',
        },
      ],
      required: false,
      linkId: '/supplementalQuestions',
      text: 'AHC HRSN Screening Supplemental Questions',
      prefix: 'II:',
      item: [
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'financialStrain',
              display: 'Financial Strain',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/financialStrain',
          text: 'Financial Strain',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '11',
                  display:
                    'How hard is it for you to pay for the very basics like food, housing, medical care, and heating? Would you say it is:',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/financialStrain/11',
              text: 'How hard is it for you to pay for the very basics like food, housing, medical care, and heating? Would you say it is:',
              prefix: '11.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: '11a1',
                    display: 'Very hard',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: '11a2',
                    display: 'Somewhat hard',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3',
                    },
                  ],
                  valueCoding: {
                    code: '11a3',
                    display: 'Not hard at all',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'employment',
              display: 'Employment',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/employment',
          text: 'Employment',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '10',
                  display: 'Do you want help finding or keeping work or a job?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/employment/10',
              text: 'Do you want help finding or keeping work or a job?',
              prefix: '10.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1*',
                    },
                  ],
                  valueCoding: {
                    code: '12a1',
                    display: 'Yes, help finding work',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: '12a2',
                    display: 'Yes, help keeping work',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3',
                    },
                  ],
                  valueCoding: {
                    code: '12a3',
                    display: 'I do not need or want help',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'familyCommunitySupport',
              display: 'Family and Community Support',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/familyCommunitySupport',
          text: 'Family and Community Support',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '13',
                  display:
                    'If for any reason you need help with day-to-day activities such as bathing, preparing meals, shopping, managing finances, etc., do you get the help you need?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/familyCommunitySupport/13',
              text: 'If for any reason you need help with day-to-day activities such as bathing, preparing meals, shopping, managing finances, etc., do you get the help you need?',
              prefix: '13.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: '13a1',
                    display: 'I don’t need any help',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2',
                    },
                  ],
                  valueCoding: {
                    code: '13a2',
                    display: 'I get all the help I need',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: '13a3',
                    display: 'I could use a little more help',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: '13a4',
                    display: 'I need a lot more help',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '14',
                  display: 'How often do you feel lonely or isolated from those around you?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/familyCommunitySupport/14',
              text: 'How often do you feel lonely or isolated from those around you?',
              prefix: '14.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: '14a1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2',
                    },
                  ],
                  valueCoding: {
                    code: '14a2',
                    display: 'Rarely',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3',
                    },
                  ],
                  valueCoding: {
                    code: '14a3',
                    display: 'Sometimes',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: '14a4',
                    display: 'Often',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: '14a5',
                    display: 'Always',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'education',
              display: 'Education',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/education',
          text: 'Education',
          item: [
            {
              type: 'boolean',
              code: [
                {
                  system: 'Custom',
                  code: '15',
                  display: 'Do you speak a language other than English at home?',
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/education/15',
              text: 'Do you speak a language other than English at home?',
              prefix: '15.',
            },
            {
              type: 'boolean',
              code: [
                {
                  system: 'Custom',
                  code: '16',
                  display:
                    'Do you want help with school or training? For example, starting or completing job training or getting a high school diploma, GED or equivalent.',
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/education/16',
              text: 'Do you want help with school or training? For example, starting or completing job training or getting a high school diploma, GED or equivalent.',
              prefix: '16.',
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'physicalActivity',
              display: 'Physical Activity',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/physicalActivity',
          text: 'Physical Activity',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '17',
                  display:
                    'In the last 30 days, other than the activities you did for work, on average, how many days per week did you engage in moderate exercise (like walking fast, running, jogging, dancing, swimming, biking, or other similar activities)?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/physicalActivity/17',
              text: 'In the last 30 days, other than the activities you did for work, on average, how many days per week did you engage in moderate exercise (like walking fast, running, jogging, dancing, swimming, biking, or other similar activities)?',
              prefix: '17.',
              answerOption: [
                {
                  valueCoding: {
                    code: '0',
                    display: '0',
                  },
                },
                {
                  valueCoding: {
                    code: '1',
                    display: '1',
                  },
                },
                {
                  valueCoding: {
                    code: '2',
                    display: '2',
                  },
                },
                {
                  valueCoding: {
                    code: '3',
                    display: '3',
                  },
                },
                {
                  valueCoding: {
                    code: '4',
                    display: '4',
                  },
                },
                {
                  valueCoding: {
                    code: '5',
                    display: '5',
                  },
                },
                {
                  valueCoding: {
                    code: '6',
                    display: '6',
                  },
                },
                {
                  valueCoding: {
                    code: '7',
                    display: '7',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '18',
                  display:
                    'On average, how many minutes did you usually spend exercising at this level on one of those days?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/physicalActivity/18',
              text: 'On average, how many minutes did you usually spend exercising at this level on one of those days?',
              prefix: '18.',
              answerOption: [
                {
                  valueCoding: {
                    code: '0',
                    display: '0',
                  },
                },
                {
                  valueCoding: {
                    code: '10',
                    display: '10',
                  },
                },
                {
                  valueCoding: {
                    code: '20',
                    display: '20',
                  },
                },
                {
                  valueCoding: {
                    code: '30',
                    display: '30',
                  },
                },
                {
                  valueCoding: {
                    code: '40',
                    display: '40',
                  },
                },
                {
                  valueCoding: {
                    code: '50',
                    display: '50',
                  },
                },
                {
                  valueCoding: {
                    code: '60',
                    display: '60',
                  },
                },
                {
                  valueCoding: {
                    code: '90',
                    display: '90',
                  },
                },
                {
                  valueCoding: {
                    code: '120',
                    display: '120',
                  },
                },
                {
                  valueCoding: {
                    code: 'ge150',
                    display: '150 or greater',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'substanceUse',
              display: 'Substance Use',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/substanceUse',
          text: 'Substance Use',
          item: [
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '19',
                  display:
                    'How many times in the past 12 months have you had 5 or more drinks in a day (males) or 4 or more drinks in a day (females)? One drink is 12 ounces of beer, 5 ounces of wine, or 1.5 ounces of 80-proof spirits.',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/substanceUse/19',
              text: 'How many times in the past 12 months have you had 5 or more drinks in a day (males) or 4 or more drinks in a day (females)? One drink is 12 ounces of beer, 5 ounces of wine, or 1.5 ounces of 80-proof spirits.',
              prefix: '19.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq2',
                    display: 'Once or Twice',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq3',
                    display: 'Monthly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq4',
                    display: 'Weekly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq5',
                    display: 'Daily or Almost Daily',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '20',
                  display:
                    'How many times in the past 12 months have you used tobacco products (like cigarettes, cigars, snuff, chew, electronic cigarettes)?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/substanceUse/20',
              text: 'How many times in the past 12 months have you used tobacco products (like cigarettes, cigars, snuff, chew, electronic cigarettes)?',
              prefix: '20.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq2',
                    display: 'Once or Twice',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq3',
                    display: 'Monthly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq4',
                    display: 'Weekly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq5',
                    display: 'Daily or Almost Daily',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '21',
                  display: 'How many times in the past year have you used prescription drugs for non-medical reasons?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/substanceUse/21',
              text: 'How many times in the past year have you used prescription drugs for non-medical reasons?',
              prefix: '21.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq2',
                    display: 'Once or Twice',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq3',
                    display: 'Monthly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq4',
                    display: 'Weekly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq5',
                    display: 'Daily or Almost Daily',
                  },
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '22',
                  display: 'How many times in the past year have you used illegal drugs?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/substanceUse/22',
              text: 'How many times in the past year have you used illegal drugs?',
              prefix: '22.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq1',
                    display: 'Never',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq2',
                    display: 'Once or Twice',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq3',
                    display: 'Monthly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq4',
                    display: 'Weekly',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: 'alFreq5',
                    display: 'Daily or Almost Daily',
                  },
                },
              ],
            },
            {
              text: 'The next questions relate to your experience with alcohol, cigarettes, and other drugs. Some of the substances are prescribed by a doctor (like pain medications), but only count those if you have taken them for reasons or in doses other than prescribed. One question is about illicit or illegal drug use, but we only ask in order to identify community services that may be available to help you.',
              type: 'display',
              linkId: '/supplementalQuestions/substanceUse-help',
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    text: 'Help-Button',
                    coding: [
                      {
                        code: 'help',
                        display: 'Help-Button',
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'mentalHealth',
              display: 'Mental Health',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/mentalHealth',
          text: 'Mental Health',
          item: [
            {
              type: 'group',
              code: [
                {
                  system: 'Custom',
                  code: '23',
                  display: 'Over the past 2 weeks, how often have you been bothered by any of the following problems?',
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/mentalHealth/23',
              text: 'Over the past 2 weeks, how often have you been bothered by any of the following problems?',
              prefix: '23.',
              item: [
                {
                  type: 'choice',
                  code: [
                    {
                      system: 'Custom',
                      code: '23a',
                      display: 'Little interest or pleasure in doing things?',
                    },
                  ],
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                      valueCodeableConcept: {
                        coding: [
                          {
                            system: 'http://hl7.org/fhir/questionnaire-item-control',
                            code: 'drop-down',
                            display: 'Drop down',
                          },
                        ],
                        text: 'Drop down',
                      },
                    },
                  ],
                  required: false,
                  linkId: '/supplementalQuestions/mentalHealth/23/23a',
                  text: 'Little interest or pleasure in doing things?',
                  prefix: 'a.',
                  answerOption: [
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 0,
                        },
                      ],
                      valueCoding: {
                        code: '23a1',
                        display: 'Not at all',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 1,
                        },
                      ],
                      valueCoding: {
                        code: '23a2',
                        display: 'Several days',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 2,
                        },
                      ],
                      valueCoding: {
                        code: '23a3',
                        display: 'More than half the days',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 3,
                        },
                      ],
                      valueCoding: {
                        code: '23a4',
                        display: 'Nearly every day',
                      },
                    },
                  ],
                },
                {
                  type: 'choice',
                  code: [
                    {
                      system: 'Custom',
                      code: '23b',
                      display: 'Feeling down, depressed, or hopeless?',
                    },
                  ],
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                      valueCodeableConcept: {
                        coding: [
                          {
                            system: 'http://hl7.org/fhir/questionnaire-item-control',
                            code: 'drop-down',
                            display: 'Drop down',
                          },
                        ],
                        text: 'Drop down',
                      },
                    },
                  ],
                  required: false,
                  linkId: '/supplementalQuestions/mentalHealth/23/23b',
                  text: 'Feeling down, depressed, or hopeless?',
                  prefix: 'b.',
                  answerOption: [
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 0,
                        },
                      ],
                      valueCoding: {
                        code: '23a1',
                        display: 'Not at all',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 1,
                        },
                      ],
                      valueCoding: {
                        code: '23a2',
                        display: 'Several days',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 2,
                        },
                      ],
                      valueCoding: {
                        code: '23a3',
                        display: 'More than half the days',
                      },
                    },
                    {
                      extension: [
                        {
                          url: 'http://hl7.org/fhir/StructureDefinition/ordinalValue',
                          valueDecimal: 3,
                        },
                      ],
                      valueCoding: {
                        code: '23a4',
                        display: 'Nearly every day',
                      },
                    },
                  ],
                },
                {
                  type: 'string',
                  code: [
                    {
                      system: 'Custom',
                      code: 'metalHealthScore',
                      display: 'Mental health score',
                    },
                  ],
                  required: false,
                  linkId: '/supplementalQuestions/mentalHealth//supplementalQuestions/mentalHealth/23/metalHealthScore',
                  text: 'Mental health score',
                  readOnly: true,
                },
                {
                  text: 'If you get 3 or more when you add the answers to questions 23a and 23b the person may have a mental health need.',
                  type: 'display',
                  linkId: '/supplementalQuestions/mentalHealth/23-help',
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                      valueCodeableConcept: {
                        text: 'Help-Button',
                        coding: [
                          {
                            code: 'help',
                            display: 'Help-Button',
                            system: 'http://hl7.org/fhir/questionnaire-item-control',
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            {
              type: 'choice',
              code: [
                {
                  system: 'Custom',
                  code: '24',
                  display:
                    'Stress means a situation in which a person feels tense, restless, nervous, or anxious, or is unable to sleep at night because his or her mind is troubled all the time. Do you feel this kind of stress these days?',
                },
              ],
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'drop-down',
                        display: 'Drop down',
                      },
                    ],
                    text: 'Drop down',
                  },
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/mentalHealth/24',
              text: 'Stress means a situation in which a person feels tense, restless, nervous, or anxious, or is unable to sleep at night because his or her mind is troubled all the time. Do you feel this kind of stress these days?',
              prefix: '24.',
              answerOption: [
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '1',
                    },
                  ],
                  valueCoding: {
                    code: '24a1',
                    display: 'Not at all',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '2*',
                    },
                  ],
                  valueCoding: {
                    code: '24a2',
                    display: 'A little bit',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '3*',
                    },
                  ],
                  valueCoding: {
                    code: '24a3',
                    display: 'Somewhat',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '4*',
                    },
                  ],
                  valueCoding: {
                    code: '24a4',
                    display: 'Quite a bit',
                  },
                },
                {
                  extension: [
                    {
                      url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                      valueString: '5*',
                    },
                  ],
                  valueCoding: {
                    code: '24a5',
                    display: 'Very much',
                  },
                },
              ],
            },
          ],
        },
        {
          type: 'group',
          code: [
            {
              system: 'Custom',
              code: 'disabilities',
              display: 'Disabilities',
            },
          ],
          required: false,
          linkId: '/supplementalQuestions/disabilities',
          text: 'Disabilities',
          item: [
            {
              type: 'boolean',
              code: [
                {
                  system: 'Custom',
                  code: '25',
                  display:
                    'Because of a physical, mental, or emotional condition, do you have serious difficulty concentrating, remembering, or making decisions? (5 years old or older)',
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/disabilities/25',
              text: 'Because of a physical, mental, or emotional condition, do you have serious difficulty concentrating, remembering, or making decisions? (5 years old or older)',
              prefix: '25.',
            },
            {
              type: 'boolean',
              code: [
                {
                  system: 'Custom',
                  code: '26',
                  display:
                    "Because of a physical, mental, or emotional condition, do you have difficulty doing errands alone such as visiting a doctor's office or shopping? (15 years old or older)",
                },
              ],
              required: false,
              linkId: '/supplementalQuestions/disabilities/26',
              text: "Because of a physical, mental, or emotional condition, do you have difficulty doing errands alone such as visiting a doctor's office or shopping? (15 years old or older)",
              prefix: '26.',
            },
          ],
        },
        {
          text: 'If someone chooses the asterisk (*) answers, they might have an unmet health-related social need.',
          type: 'display',
          linkId: '/supplementalQuestions-help',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
              valueCodeableConcept: {
                text: 'Help-Button',
                coding: [
                  {
                    code: 'help',
                    display: 'Help-Button',
                    system: 'http://hl7.org/fhir/questionnaire-item-control',
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  ],
};
