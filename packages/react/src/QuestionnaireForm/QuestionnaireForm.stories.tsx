import { Meta } from '@storybook/react';
import { Document } from '../Document/Document';
import { QuestionnaireForm } from './QuestionnaireForm';
import { QuestionnaireResponse } from '@medplum/fhirtypes';

export default {
  title: 'Medplum/QuestionnaireForm',
  component: QuestionnaireForm,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'basic-example',
        title: 'Basic Example',
        item: [
          {
            linkId: 'titleDisplay',
            text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
            type: 'display',
          },
          {
            linkId: 'abc',
            text: 'Question',
            type: 'string',
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Groups = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'groups-example',
        title: 'Groups Example',
        item: [
          {
            linkId: 'group1',
            text: 'Group 1',
            type: 'group',
            item: [
              {
                linkId: 'question1',
                text: 'Question 1',
                type: 'string',
              },
              {
                linkId: 'question2',
                text: 'Question 2',
                type: 'string',
              },
            ],
          },
          {
            linkId: 'group2',
            text: 'Group 2',
            type: 'group',
            item: [
              {
                linkId: 'question3',
                text: 'Question 3',
                type: 'string',
              },
              {
                linkId: 'question4',
                text: 'Question 4',
                type: 'string',
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Choices = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'nested-example',
        title: 'Nested Groups Example',
        item: [
          {
            linkId: 'group1',
            type: 'group',
            text: 'Outside Group',
            repeats: true,
            item: [
              {
                linkId: 'group2',
                type: 'group',
                text: 'Inside Group',
                repeats: true,
                item: [
                  {
                    linkId: 'q1',
                    type: 'choice',
                    text: 'Question 1',
                    answerOption: [
                      {
                        valueString: 'Yes',
                      },
                      {
                        valueString: 'No',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const Pages = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'pages-example',
        title: 'Pages Example',
        item: [
          {
            linkId: 'group1',
            text: 'Group 1',
            type: 'group',
            item: [
              {
                linkId: 'question1',
                text: 'Question 1',
                type: 'string',
                required: true,
              },
              {
                linkId: 'question2',
                text: 'Question 2',
                type: 'string',
              },
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'page',
                    },
                  ],
                },
              },
            ],
          },
          {
            linkId: 'group2',
            text: 'Group 2',
            type: 'group',
            item: [
              {
                linkId: 'question3',
                text: 'Question 3',
                type: 'reference',
                required: true,
              },
              {
                linkId: 'question4',
                text: 'Question 4',
                type: 'string',
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
export const LabOrdering = (): JSX.Element => {
  function orderTypes(id: string, title: string, enableQuestion: string): any {
    return {
      id: id + '-group',
      linkId: id + '-group',
      text: title,
      type: 'group',
      enableWhen: [
        {
          question: enableQuestion,
          operator: '=',
          answerCoding: { code: id, system: 'http://loinc.org' },
        },
      ],
      item: [
        {
          id: id + '-priority',
          linkId: id + '-priority',
          type: 'choice',
          text: 'Priority',

          answerOption: [
            {
              valueCoding: {
                code: 'STAT',
                display: 'STAT',
                system: 'http://loinc.org',
              },
            },
            {
              valueCoding: {
                code: 'Unscheduled',
                display: 'Unscheduled',
                system: 'http://loinc.org',
              },
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
        },
        {
          id: id + 'notes',
          linkId: id + 'notes',
          text: 'Test Notes',
          type: 'string',
          extension: [
            {
              url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-items',
              valueString: 'match-values',
            },
          ],
        },
      ],
    };
  }

  const vendors: any = {
    id: 'question2',
    linkId: 'question2',
    text: 'Vendor',
    type: 'choice',
    answerOption: [
      {
        valueCoding: {
          code: '1',
          display: 'HGDX LabCorp',
          system: 'http://loinc.org',
        },
      },
      {
        valueCoding: {
          code: '2',
          display: 'HGDX Quest',
          system: 'http://loinc.org',
        },
      },
    ],
    extension: [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://hl7.org/fhir/questionnaire-item-control',
              code: 'page',
            },
          ],
        },
      },
    ],
  };

  const orders: any = {
    id: 'the-big',
    linkId: 'q2',
    type: 'group',
    text: 'Orders',
    item: [
      orderTypes('metabolicpanel', 'Comp. Metabolic Panel', 'labcorp-tests'),
      orderTypes('factor', 'Factor XIII', 'labcorp-tests'),
      orderTypes('glucose', 'Glucose', 'labcorp-tests'),
      orderTypes('hemoglobin', 'Hemoglobin A1c', 'labcorp-tests'),
      orderTypes('iron-and-tibc', 'Iron and TIBC', 'labcorp-tests'),
      orderTypes('lead-blood', 'Lead,Blood (Adult)', 'labcorp-tests'),
      orderTypes('rpr', 'RPR', 'labcorp-tests'),
      orderTypes('1', 'TSH', 'quest-tests'),
      {
        id: 'urine-culture-group',
        linkId: 'urine-culture-group',
        text: 'Urine Culture, Routine',
        type: 'group',
        enableWhen: [
          {
            question: 'labcorp-tests',
            operator: '=',
            answerCoding: { code: 'urine-culture', system: 'http://loinc.org' },
          },
        ],
        item: [
          {
            id: 'urine-culture-priority',
            linkId: 'urine-culture-priority',
            text: 'Priority',
            type: 'choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'STAT',
                  display: 'STAT',
                  system: 'http://loinc.org',
                },
              },
              {
                valueCoding: {
                  code: 'Unscheduled',
                  display: 'Unscheduled',
                  system: 'http://loinc.org',
                },
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
          },
          {
            id: 'urine-culture-notes',
            linkId: 'urine-culture-notes',
            text: 'Test Notes',
            type: 'string',
          },
          {
            id: 'urine-culture-sample',
            linkId: 'urine-culture-sample',
            type: 'choice',
            text: 'Sample',

            answerOption: [
              {
                valueCoding: {
                  code: 'urine',
                  display: 'urine',
                  system: 'http://loinc.org',
                },
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
          },
        ],
      },
    ],
  };

  return (
    <Document>
      <QuestionnaireForm
        questionnaire={{
          resourceType: 'Questionnaire',
          id: 'lab-order-example',
          title: 'Lab Order Example',
          item: [
            {
              linkId: 'patient-name',
              text: 'Patient Name',
              type: 'reference',
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/questionnaire-item-control',
                        code: 'page',
                      },
                    ],
                  },
                },
                {
                  id: 'reference-patient',
                  url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                  valueCodeableConcept: {
                    coding: [
                      {
                        system: 'http://hl7.org/fhir/fhir-types',
                        display: 'Patient',
                        code: 'Patient',
                      },
                    ],
                  },
                },
              ],
            },
            vendors,
            {
              linkId: 'tests-page',
              text: 'Tests',
              type: 'group',
              item: [
                {
                  id: 'labcorp-tests',
                  linkId: 'labcorp-tests',
                  text: 'Available Tests',
                  type: 'choice',
                  repeats: true,
                  enableWhen: [
                    {
                      question: 'question2',
                      operator: '=',
                      answerCoding: { code: '1', system: 'http://loinc.org' },
                    },
                  ],
                  answerOption: [
                    {
                      valueCoding: {
                        code: 'metabolicpanel',
                        display: 'Comp. Metabolic Panel',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'factor',
                        display: 'Factor XIII',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'glucose',
                        display: 'Glucose',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'hemoglobin',
                        display: 'Hemoglobin A1c',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'iron-and-tibc',
                        display: 'Iron and TIBC',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'lead-blood',
                        display: 'Lead,Blood (Adult)',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'rpr',
                        display: 'RPR',
                        system: 'http://loinc.org',
                      },
                    },
                    {
                      valueCoding: {
                        code: 'urine-culture',
                        display: 'Urine Culture, Routine',
                        system: 'http://loinc.org',
                      },
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
                },
                {
                  id: 'quest-tests',
                  linkId: 'quest-tests',
                  text: 'Available Tests',
                  type: 'choice',
                  repeats: true,
                  enableWhen: [
                    {
                      question: 'question2',
                      operator: '=',
                      answerCoding: { code: '2', system: 'http://loinc.org' },
                    },
                  ],
                  answerOption: [
                    {
                      valueCoding: {
                        code: '1',
                        display: 'TSH',
                        system: 'http://loinc.org',
                      },
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
                },
                orders,
              ],
            },
            {
              linkId: 'complete',
              text: 'Complete',
              type: 'group',
              item: [
                {
                  linkId: 'complete-form',
                  type: 'group',
                  item: [
                    {
                      linkId: 'selecting-patient-diagnoses',
                      text: 'Selecting Patient Diagnoses',
                      type: 'string',
                    },
                    {
                      linkId: 'ordering-physician',
                      text: 'Ordering Physician',
                      type: 'reference',
                      extension: [
                        {
                          id: 'reference-physician',
                          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                          valueCodeableConcept: {
                            coding: [
                              {
                                system: 'http://hl7.org/fhir/fhir-types',
                                display: 'Practitioner',
                                code: 'Practitioner',
                              },
                            ],
                          },
                        },
                      ],
                    },
                    {
                      linkId: 'specimen-collection',
                      text: 'Specimen For the Order Collected',
                      type: 'boolean',
                    },
                    {
                      linkId: 'schedule-future-order',
                      text: 'Schedule Future Order',
                      type: 'boolean',
                    },
                    {
                      linkId: 'billing',
                      text: 'Bill To',
                      type: 'choice',
                      answerOption: [
                        {
                          valueCoding: {
                            code: 'patient',
                            display: 'Patient',
                            system: 'http://loinc.org',
                          },
                        },
                        {
                          valueCoding: {
                            code: 'client',
                            display: 'Client',
                            system: 'http://loinc.org',
                          },
                        },
                        {
                          valueCoding: {
                            code: 'guarantor',
                            display: 'Guarantor',
                            system: 'http://loinc.org',
                          },
                        },
                        {
                          valueCoding: {
                            code: 'third-party',
                            display: 'Third Party',
                            system: 'http://loinc.org',
                          },
                        },
                      ],
                    },
                    {
                      linkId: 'save-quick-order',
                      text: 'Save as Quick Order',
                      type: 'boolean',
                    },
                  ],
                },
              ],
            },
            {
              linkId: 'review',
              text: 'Review',
              type: 'group',
              item: [
                {
                  linkId: 'send-to-lab',
                  text: 'Send to Lab',
                  type: 'boolean',
                },
                {
                  linkId: 'generate-pdf',
                  text: 'Generate PDF',
                  type: 'boolean',
                },
              ],
            },
          ],
        }}
        onSubmit={(formData: any) => {
          console.log('submit', formData);
        }}
      />
    </Document>
  );
};

const PagedQuestionnaire = {
  resourceType: 'Questionnaire',
  id: 'pages-example',
  title: 'Pages Example',
  item: [
    {
      linkId: 'group1',
      text: 'Page Sequence 1',
      type: 'group',
      item: [
        {
          linkId: 'question1',
          text: 'Question 1',
          type: 'string',
        },
        {
          linkId: 'question2',
          text: 'Question 2',
          type: 'string',
        },
        {
          linkId: 'q1',
          text: 'Question 1',
          type: 'choice',
          answerOption: [
            {
              valueString: 'Yes',
            },
            {
              valueString: 'No',
            },
          ],
        },
        {
          linkId: 'question1-4',
          text: 'Multi Select Question',
          type: 'choice',
          repeats: true,
          answerOption: [
            {
              valueString: 'value1',
            },
            {
              valueString: 'value2',
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
        },
      ],
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/questionnaire-item-control',
                code: 'page',
              },
            ],
          },
        },
      ],
    },
    {
      linkId: 'group2',
      text: 'Page Sequence 2',
      type: 'group',
      item: [
        {
          linkId: 'question3',
          text: 'Question 3',
          type: 'string',
        },
        {
          linkId: 'question4',
          text: 'Question 4',
          type: 'string',
        },
      ],
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/questionnaire-item-control',
                code: 'page',
              },
            ],
          },
        },
      ],
    },
  ],
};

export const PageSequence = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={PagedQuestionnaire}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const DisablePagination = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      disablePagination
      questionnaire={PagedQuestionnaire}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const PageAndNonPageSequence = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'groups-example',
        title: 'Groups Example',
        item: [
          {
            linkId: 'group1',
            text: 'Page Sequence 1',
            type: 'group',
            item: [
              {
                linkId: 'question1',
                text: 'Question 1',
                type: 'string',
              },
              {
                linkId: 'question2',
                text: 'Question 2',
                type: 'string',
              },
              {
                linkId: 'q1',
                text: 'Question 1',
                type: 'choice',
                answerOption: [
                  {
                    valueString: 'Yes',
                  },
                  {
                    valueString: 'No',
                  },
                ],
              },
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'page',
                    },
                  ],
                },
              },
            ],
          },
          {
            linkId: 'group2',
            text: 'Page Sequence 2',
            type: 'group',
            item: [
              {
                linkId: 'question3',
                text: 'Question 3',
                type: 'string',
              },
              {
                linkId: 'question4',
                text: 'Question 4',
                type: 'string',
              },
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'page',
                    },
                  ],
                },
              },
            ],
          },
          {
            linkId: 'q3',
            text: 'Question 3',
            type: 'choice',
            answerOption: [
              {
                valueString: 'Red',
              },
              {
                valueString: 'Blue',
              },
              {
                valueString: 'Yellow',
              },
            ],
          },
          {
            linkId: 'boolean',
            type: 'boolean',
            text: 'Boolean',
            initial: [
              {
                valueBoolean: true,
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const MultipleChoice = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'multiple-choice',
        title: 'Multiple Choice Example',
        item: [
          {
            linkId: 'q1',
            text: 'Question 1',
            type: 'choice',
            answerOption: [
              {
                valueString: 'Red',
              },
              {
                valueString: 'Blue',
              },
              {
                valueString: 'Yellow',
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const EnableWhen = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'enable-when',
        title: 'Enable When',
        item: [
          {
            linkId: 'q1',
            text: 'Enabled when the answer is "Yes"',
            type: 'choice',
            answerOption: [
              {
                valueString: 'Yes',
              },
              {
                valueString: 'No',
              },
            ],
          },
          {
            linkId: 'q2',
            type: 'display',
            text: 'Displayed because the answer is "Yes"!',
            enableWhen: [
              {
                question: 'q1',
                operator: '=',
                answerString: 'Yes',
              },
            ],
          },
          {
            linkId: 'q3',
            text: 'Enabled when there is an answer',
            type: 'choice',
            answerOption: [
              {
                valueString: 'Yes',
              },
              {
                valueString: 'No',
              },
            ],
          },
          {
            linkId: 'q4',
            type: 'display',
            text: 'Displayed because there is an answer!',
            enableWhen: [
              {
                question: 'q3',
                operator: 'exists', // `exists` signals if a given answer has a value
                answerBoolean: true,
              },
            ],
          },
          {
            linkId: 'q5',
            text: "Enabled when there isn't an answer",
            type: 'choice',
            answerOption: [
              {
                valueString: 'Yes',
              },
              {
                valueString: 'No',
              },
            ],
          },
          {
            linkId: 'q6',
            type: 'display',
            text: "Displayed because there isn't an answer!",
            enableWhen: [
              {
                question: 'q5',
                operator: 'exists',
                answerBoolean: false,
              },
            ],
          },
          {
            linkId: 'q7',
            text: 'Enabled when greater than 2',
            type: 'choice',
            answerOption: [
              {
                valueInteger: 2,
              },
              {
                valueInteger: 5,
              },
            ],
          },
          {
            linkId: 'q8',
            type: 'display',
            text: 'Displayed because answer is greater than 2!',
            enableWhen: [
              {
                question: 'q7',
                operator: '>',
                answerInteger: 2,
              },
            ],
          },
          {
            linkId: 'q9',
            text: 'Enabled when greater than or equal to 2',
            type: 'choice',
            answerOption: [
              {
                valueInteger: 2,
              },
              {
                valueInteger: 5,
              },
            ],
          },
          {
            linkId: 'q10',
            type: 'display',
            text: 'Displayed because answer is greater than or equal to 2!',
            enableWhen: [
              {
                question: 'q9',
                operator: '>=',
                answerInteger: 2,
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const ExcludeButtonsWithOnChange = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'basic-example',
        title: 'Basic Example',
        item: [
          {
            linkId: 'abc',
            text: 'Question 1',
            type: 'string',
          },
          {
            linkId: 'choice',
            type: 'choice',
            text: 'Choice',
            answerOption: [
              {
                valueString: 'First',
              },
              {
                valueString: 'Second',
              },
            ],
          },
        ],
      }}
      excludeButtons
      onChange={(qr: QuestionnaireResponse) => {
        console.log('onChange', qr);
      }}
    />
  </Document>
);

export const RepeatableItems = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'repeatables-example',
        title: 'Repeatables Example',
        item: [
          {
            linkId: 'group1',
            text: 'Question Group',
            type: 'group',
            item: [
              {
                linkId: 'question1',
                text: 'Question 1',
                type: 'string',
              },
              {
                linkId: 'question2',
                text: 'Question 2',
                type: 'string',
              },
            ],
            repeats: true,
          },
          {
            linkId: 'question3',
            text: 'Repeatable Question',
            type: 'string',
            repeats: true,
          },
          {
            linkId: 'question4',
            text: 'Repeatable Date',
            type: 'date',
            repeats: true,
          },
          {
            linkId: 'question5',
            text: 'Multi Select',
            type: 'choice',
            repeats: true,
            answerOption: [
              {
                valueString: 'value1',
              },
              {
                valueString: 'value2',
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
          },
          {
            linkId: 'boolean',
            type: 'boolean',
            text: 'Boolean',
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const KitchenSink = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'kitchen-sink',
        title: 'Kitchen Sink Exmple',
        item: [
          {
            linkId: 'i1',
            type: 'display',
            text: 'This is an example of all question types.  See: https://www.hl7.org/fhir/valueset-item-type.html',
          },
          {
            linkId: 'boolean',
            type: 'boolean',
            text: 'Boolean',
          },
          {
            linkId: 'decimal',
            type: 'decimal',
            text: 'Decimal',
          },
          {
            linkId: 'integer',
            type: 'integer',
            text: 'Integer',
          },
          {
            linkId: 'date',
            type: 'date',
            text: 'Date',
          },
          {
            linkId: 'dateTime',
            type: 'dateTime',
            text: 'Date Time',
          },
          {
            linkId: 'time',
            type: 'time',
            text: 'Time',
          },
          {
            linkId: 'string',
            type: 'string',
            text: 'String',
          },
          {
            linkId: 'text',
            type: 'text',
            text: 'Text',
          },
          {
            linkId: 'url',
            type: 'url',
            text: 'URL',
          },
          {
            linkId: 'choice',
            type: 'choice',
            text: 'Choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'code1',
                },
              },
              {
                valueDate: '2020-01-01',
              },
              {
                valueInteger: 123,
              },
              {
                valueString: 'string',
              },
              {
                valueReference: {
                  reference: 'Organization/123',
                  display: 'Test Organization',
                },
              },
            ],
          },
          {
            linkId: 'value-set-choice',
            type: 'choice',
            text: 'Value Set Choice',
            answerValueSet: 'http://loinc.org/vs/LL4436-3',
          },
          {
            linkId: 'open-choice',
            type: 'open-choice',
            text: 'Open Choice',
          },
          {
            linkId: 'attachment',
            type: 'attachment',
            text: 'Attachment',
          },
          {
            linkId: 'reference',
            type: 'reference',
            text: 'Reference',
          },
          {
            linkId: 'quantity',
            type: 'quantity',
            text: 'Quantity',
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const KitchenSinkWithInitialValues = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        resourceType: 'Questionnaire',
        id: 'kitchen-sink',
        title: 'Kitchen Sink Exmple',
        item: [
          {
            linkId: 'i1',
            type: 'display',
            text: 'This is an example of all question types.  See: https://www.hl7.org/fhir/valueset-item-type.html',
          },
          {
            linkId: 'boolean',
            type: 'boolean',
            text: 'Boolean',
            initial: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            linkId: 'decimal',
            type: 'decimal',
            text: 'Decimal',
            initial: [
              {
                valueDecimal: 123.45,
              },
            ],
          },
          {
            linkId: 'integer',
            type: 'integer',
            text: 'Integer',
            initial: [
              {
                valueInteger: 123,
              },
            ],
          },
          {
            linkId: 'date',
            type: 'date',
            text: 'Date',
            initial: [
              {
                valueDate: '2020-01-01',
              },
            ],
          },
          {
            linkId: 'dateTime',
            type: 'dateTime',
            text: 'Date Time',
            initial: [
              {
                valueDateTime: '2020-01-01T00:00:00Z',
              },
            ],
          },
          {
            linkId: 'time',
            type: 'time',
            text: 'Time',
            initial: [
              {
                valueTime: '09:40:00',
              },
            ],
          },
          {
            linkId: 'string',
            type: 'string',
            text: 'String',
            initial: [
              {
                valueString: 'foo',
              },
            ],
          },
          {
            linkId: 'text',
            type: 'text',
            text: 'Text',
            initial: [
              {
                valueString: 'Lorem ipsum',
              },
            ],
          },
          {
            linkId: 'url',
            type: 'url',
            text: 'URL',
            initial: [
              {
                valueUri: 'https://example.com',
              },
            ],
          },
          {
            linkId: 'choice',
            type: 'choice',
            text: 'Choice',
            answerOption: [
              {
                valueCoding: {
                  code: 'code1',
                },
              },
              {
                valueDate: '2020-01-01',
              },
              {
                valueInteger: 123,
              },
              {
                valueString: 'string',
              },
              {
                valueReference: {
                  reference: 'Organization/123',
                  display: 'Test Organization',
                },
              },
            ],
            initial: [
              {
                valueReference: {
                  reference: 'Organization/123',
                  display: 'Test Organization',
                },
              },
            ],
          },
          {
            linkId: 'value-set-choice',
            type: 'choice',
            text: 'Value Set Choice',
            answerValueSet: 'http://loinc.org/vs/LL4436-3',
          },
          {
            linkId: 'open-choice',
            type: 'open-choice',
            text: 'Open Choice',
          },
          {
            linkId: 'attachment',
            type: 'attachment',
            text: 'Attachment',
          },
          {
            linkId: 'reference',
            type: 'reference',
            text: 'Reference',
            initial: [
              {
                valueReference: {
                  reference: 'Organization/123',
                },
              },
            ],
          },
          {
            linkId: 'reference-target-types',
            type: 'reference',
            text: 'Reference (target types)',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/fhir-types',
                      display: 'Patient',
                      code: 'Patient',
                    },
                  ],
                },
              },
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/fhir-types',
                      display: 'Practitioner',
                      code: 'Practitioner',
                    },
                  ],
                },
              },
            ],
          },
          {
            linkId: 'quantity',
            type: 'quantity',
            text: 'Quantity',
            initial: [
              {
                valueQuantity: {
                  value: 123,
                  unit: 'kg',
                },
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const USSurgeonGeneralFamilyHealthPortrait = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
        id: '54127-6-x',
        meta: {
          versionId: '1',
          lastUpdated: '2022-07-03T03:13:02.000-04:00',
          source: '#qWxii09ZAuzB2C9W',
          profile: ['http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire|2.7'],
          tag: [
            {
              code: 'lformsVersion: 30.3.0',
            },
          ],
        },
        extension: [
          {
            url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-launchContext',
            extension: [
              {
                url: 'name',
                valueId: 'patient',
              },
              {
                url: 'type',
                valueCode: 'Patient',
              },
              {
                url: 'descripton',
                valueString: 'For filling in patient information as the subject for the form',
              },
            ],
          },
        ],
        date: '2018-11-05T16:54:56-05:00',
        identifier: [
          {
            system: 'http://loinc.org',
            value: '54127-6',
          },
        ],
        code: [
          {
            system: 'http://loinc.org',
            code: '54127-6',
            display: 'US Surgeon General family health portrait',
          },
        ],
        subjectType: ['Patient', 'Person'],
        status: 'draft',
        name: 'US Surgeon General family health portrait',
        title: 'US Surgeon General family health portrait',
        resourceType: 'Questionnaire',
        item: [
          {
            type: 'group',
            code: [
              {
                system: 'http://loinc.org',
                code: '54126-8',
                display: 'My health history',
              },
            ],
            required: false,
            linkId: '/54126-8',
            text: 'My health history',
            item: [
              {
                type: 'string',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54125-0',
                    display: 'Name',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
                    valueExpression: {
                      description: 'Name from patient resource',
                      language: 'text/fhirpath',
                      expression: "%patient.name[0].select(given.first() + ' ' +  family)",
                    },
                  },
                ],
                required: false,
                linkId: '/54126-8/54125-0',
                text: 'Name',
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54131-8',
                    display: 'Gender',
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
                linkId: '/54126-8/54131-8',
                text: 'Gender',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA2-8',
                      display: 'Male',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA3-6',
                      display: 'Female',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA46-8',
                      display: 'Other',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'date',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '21112-8',
                    display: 'Birth Date',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
                    valueExpression: {
                      description: 'Birth date from patient resource',
                      language: 'text/fhirpath',
                      expression: '%patient.birthDate',
                    },
                  },
                ],
                required: false,
                linkId: '/54126-8/21112-8',
                text: 'Birth Date',
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54132-6',
                    display: 'Twin',
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
                linkId: '/54126-8/54132-6',
                text: 'Twin',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA10427-5',
                      display: 'Yes - Identical (Same)',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10428-3',
                      display: 'Yes - Fraternal (Different)',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54128-4',
                    display: 'Adopted',
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
                linkId: '/54126-8/54128-4',
                text: 'Adopted',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA33-6',
                      display: 'Yes',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54135-9',
                    display: 'Parents related',
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
                linkId: '/54126-8/54135-9',
                text: 'Parents related',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA33-6',
                      display: 'Yes',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'decimal',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '8302-2',
                    display: 'Body height',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationLinkPeriod',
                    valueDuration: {
                      value: 100,
                      unit: 'year',
                      system: 'http://unitsofmeasure.org',
                      code: 'a',
                    },
                  },
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationExtract',
                    valueBoolean: true,
                  },
                  {
                    url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
                    valueCoding: {
                      code: '[in_i]',
                      system: 'http://unitsofmeasure.org',
                    },
                  },
                ],
                required: false,
                linkId: '/54126-8/8302-2',
                text: 'Body height',
              },
              {
                type: 'decimal',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '29463-7',
                    display: 'Weight',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationLinkPeriod',
                    valueDuration: {
                      value: 100,
                      unit: 'year',
                      system: 'http://unitsofmeasure.org',
                      code: 'a',
                    },
                  },
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-observationExtract',
                    valueBoolean: true,
                  },
                  {
                    url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
                    valueCoding: {
                      code: 'kg',
                      system: 'http://unitsofmeasure.org',
                    },
                  },
                ],
                required: false,
                linkId: '/54126-8/29463-7',
                text: 'Weight',
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54134-2',
                    display: 'Race',
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
                linkId: '/54126-8/54134-2',
                text: 'Race',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA10608-0',
                      display: 'American Indian or Alaska Native',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA6156-9',
                      display: 'Asian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10614-8',
                      display: '-- Asian Indian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10615-5',
                      display: '-- Chinese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10616-3',
                      display: '-- Filipino',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10617-1',
                      display: '-- Japanese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10618-9',
                      display: '-- Korean',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10620-5',
                      display: '-- Vietnamese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10619-7',
                      display: '-- Other Asian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10610-6',
                      display: 'Black or African American',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10611-4',
                      display: 'Native Hawaiian or Other Pacific Islander',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10623-9',
                      display: '-- Native Hawaiian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10622-1',
                      display: '-- Guamanian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10621-3',
                      display: '-- Chamorro',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10625-4',
                      display: '-- Samoan',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10624-7',
                      display: '-- Other Pacific Islander',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA4457-3',
                      display: 'White',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10613-0',
                      display: 'Other/Unknown/Refuse To Answer',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54133-4',
                    display: 'Ethnicity',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                    valueCodeableConcept: {
                      coding: [
                        {
                          system: 'http://hl7.org/fhir/questionnaire-item-control',
                          code: 'autocomplete',
                          display: 'Auto-complete',
                        },
                      ],
                      text: 'Auto-complete',
                    },
                  },
                ],
                required: false,
                repeats: true,
                linkId: '/54126-8/54133-4',
                text: 'Ethnicity',
                answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-Ethnicity',
              },
              {
                type: 'group',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54137-5',
                    display: 'Diseases history panel',
                  },
                ],
                required: false,
                repeats: true,
                linkId: '/54126-8/54137-5',
                text: 'Diseases history panel',
                item: [
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54140-9',
                        display: 'History of diseases',
                      },
                    ],
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                        valueCodeableConcept: {
                          coding: [
                            {
                              system: 'http://hl7.org/fhir/questionnaire-item-control',
                              code: 'autocomplete',
                              display: 'Auto-complete',
                            },
                          ],
                          text: 'Auto-complete',
                        },
                      },
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/terminology-server',
                        valueUrl: 'https://clinicaltables.nlm.nih.gov/fhir/R4',
                      },
                    ],
                    required: false,
                    linkId: '/54126-8/54137-5/54140-9',
                    text: 'History of diseases',
                    answerValueSet: 'http://clinicaltables.nlm.nih.gov/fhir/R4/ValueSet/conditions',
                  },
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54130-0',
                        display: 'Age range at onset of disease',
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
                    linkId: '/54126-8/54137-5/54130-0',
                    text: 'Age range at onset of disease',
                    answerOption: [
                      {
                        valueCoding: {
                          code: 'LA10402-8',
                          display: 'Pre-Birth',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10403-6',
                          display: 'Newborn',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10394-7',
                          display: 'Infancy',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10395-4',
                          display: 'Childhood',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10404-4',
                          display: 'Adolescence',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10396-2',
                          display: '20-29',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10397-0',
                          display: '30-39',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10398-8',
                          display: '40-49',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10399-6',
                          display: '50-59',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10400-2',
                          display: 'OVER 60',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA4489-6',
                          display: 'Unknown',
                          system: 'http://loinc.org',
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
                system: 'http://loinc.org',
                code: '54114-4',
                display: 'Family member health history',
              },
            ],
            required: false,
            repeats: true,
            linkId: '/54114-4',
            text: 'Family member health history',
            item: [
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54136-7',
                    display: 'Relationship to patient',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-displayCategory',
                    valueCodeableConcept: {
                      coding: [
                        {
                          display: 'The relationship of a family member to the patient.',
                        },
                      ],
                      text: 'The relationship of a family member to the patient.',
                    },
                  },
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
                linkId: '/54114-4/54136-7',
                text: 'Relationship to patient',
                answerOption: [
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'DAU',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10405-1',
                      display: 'Daughter',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'GRNDDAU',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10406-9',
                      display: 'Granddaughter',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'GRNDSON',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10407-7',
                      display: 'Grandson',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'HBRO',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10408-5',
                      display: 'Half-brother',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'HSIS',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10409-3',
                      display: 'Half-sister',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'MAUNT',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10410-1',
                      display: 'Maternal Aunt',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'MCOUSN',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10411-9',
                      display: 'Maternal Cousin',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'MGRFTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10412-7',
                      display: 'Maternal Grandfather',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'MGRMTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10413-5',
                      display: 'Maternal Grandmother',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'MUNCLE',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10414-3',
                      display: 'Maternal Uncle',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NBRO',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10415-0',
                      display: 'Brother',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NFTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10416-8',
                      display: 'Father',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NMTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10417-6',
                      display: 'Mother',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NSIS',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10418-4',
                      display: 'Sister',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NEPHEW',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10419-2',
                      display: 'Nephew',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'NIECE',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10420-0',
                      display: 'Niece',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'PAUNT',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10421-8',
                      display: 'Paternal Aunt',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'PCOUSN',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10422-6',
                      display: 'Paternal Cousin',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'PGRFTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10423-4',
                      display: 'Paternal Grandfather',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'PGRMTH',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10424-2',
                      display: 'Paternal Grandmother',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'PUNCLE',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10425-9',
                      display: 'Paternal Uncle',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-optionPrefix',
                        valueString: 'SON',
                      },
                    ],
                    valueCoding: {
                      code: 'LA10426-7',
                      display: 'Son',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'string',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54138-3',
                    display: 'Name',
                  },
                ],
                required: false,
                linkId: '/54114-4/54138-3',
                text: 'Name',
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54123-5',
                    display: 'Gender',
                  },
                ],
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-initialExpression',
                    valueExpression: {
                      description: 'Gender from patient resource',
                      language: 'text/fhirpath',
                      expression: '%patient.gender',
                    },
                  },
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
                linkId: '/54114-4/54123-5',
                text: 'Gender',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA2-8',
                      display: 'Male',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA3-6',
                      display: 'Female',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA46-8',
                      display: 'Other',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54139-1',
                    display: 'Living?',
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
                linkId: '/54114-4/54139-1',
                text: 'Living?',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA33-6',
                      display: 'Yes',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA4489-6',
                      display: 'Unknown',
                      system: 'http://loinc.org',
                    },
                  },
                ],
                item: [
                  {
                    type: 'date',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54124-3',
                        display: 'Date of Birth',
                      },
                    ],
                    required: false,
                    linkId: '/54114-4/54139-1/54124-3',
                    text: 'Date of Birth',
                    enableWhen: [
                      {
                        answerCoding: {
                          code: 'LA33-6',
                          system: 'http://loinc.org',
                        },
                        question: '/54114-4/54139-1',
                        operator: '=',
                      },
                    ],
                  },
                  {
                    type: 'decimal',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54141-7',
                        display: 'Current Age',
                      },
                    ],
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-unit',
                        valueCoding: {
                          code: 'a',
                          display: 'year',
                          system: 'http://unitsofmeasure.org',
                        },
                      },
                    ],
                    required: false,
                    linkId: '/54114-4/54139-1/54141-7',
                    text: 'Current Age',
                    enableWhen: [
                      {
                        answerCoding: {
                          code: 'LA33-6',
                          system: 'http://loinc.org',
                        },
                        question: '/54114-4/54139-1',
                        operator: '=',
                      },
                    ],
                  },
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54112-8',
                        display: 'Cause of Death',
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
                    linkId: '/54114-4/54139-1/54112-8',
                    text: 'Cause of Death',
                    enableWhen: [
                      {
                        answerCoding: {
                          code: 'LA32-8',
                          system: 'http://loinc.org',
                        },
                        question: '/54114-4/54139-1',
                        operator: '=',
                      },
                    ],
                    answerOption: [
                      {
                        valueCoding: {
                          code: 'LA10533-0',
                          display: 'Blood Clots',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10572-8',
                          display: '-- Blood Clot in Leg',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10573-6',
                          display: '-- Blood Clot in Lungs',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10524-9',
                          display: 'Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10549-6',
                          display: '-- Bone Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10536-3',
                          display: '-- Breast Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10537-1',
                          display: '-- Colon Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10548-8',
                          display: '-- Esophageal Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10547-0',
                          display: '-- Gastric Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10541-3',
                          display: '-- Kidney Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10545-4',
                          display: '-- Leukemia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10542-1',
                          display: '-- Lung Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10546-2',
                          display: '-- Muscle Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10539-7',
                          display: '-- Ovarian Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10538-9',
                          display: '-- Prostate Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10543-9',
                          display: '-- Skin Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10540-5',
                          display: '-- Thyroid Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10544-7',
                          display: '-- Uterine Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10550-4',
                          display: '-- Other Cancer',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10529-8',
                          display: 'Diabetes',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10551-2',
                          display: '-- Diabetes Type 1',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10552-0',
                          display: '-- Diabetes Type 2',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10553-8',
                          display: '-- Gestational Diabetes',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10532-2',
                          display: 'Gastrointestinal Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10554-6',
                          display: "-- Crohn's Disease",
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10555-3',
                          display: '-- Irritable Bowel Syndrome',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10556-1',
                          display: '-- Ulceritive Colitis',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10557-9',
                          display: '-- Colon Polyps',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10523-1',
                          display: 'Heart Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10558-7',
                          display: '-- Heart Attack',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10526-4',
                          display: 'High Cholesterol/Hyperlipidemia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA7444-8',
                          display: 'Hypertension',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10528-0',
                          display: 'Kidney Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10565-2',
                          display: '-- Cystic Kidney Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10566-0',
                          display: '-- Kidney Disease Present From Birth',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10567-8',
                          display: '-- Nephrosis',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10568-6',
                          display: '-- Nephritis',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10569-4',
                          display: '-- Nephrotic Syndrome',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10570-2',
                          display: '-- Diabetic Kidney Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10571-0',
                          display: '-- Other/Unknown',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10531-4',
                          display: 'Lung Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10559-5',
                          display: '-- COPD',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10560-3',
                          display: '-- Chronic Bronchitis',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10561-1',
                          display: '-- Emphysema',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10562-9',
                          display: '-- Chronic Lower Respiratory Disease',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10563-7',
                          display: '-- Influenza/Pneumonia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10564-5',
                          display: '-- Asthma',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10590-0',
                          display: 'Neurological Disorders',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10527-2',
                          display: 'Osteoporosis',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10535-5',
                          display: 'Psychological Disorders',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10574-4',
                          display: '-- Anxiety',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10575-1',
                          display: '-- Bipolar/Manic Depressive Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10576-9',
                          display: '-- Depression',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10577-7',
                          display: '-- Attention Deficit Hyper Activity',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10578-5',
                          display: '-- Autism',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10579-3',
                          display: '-- Personality Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10580-1',
                          display: '-- Eating Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10581-9',
                          display: '-- Obsessive Compulsive Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10582-7',
                          display: '-- Panic Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10583-5',
                          display: '-- Post Traumatic Stress Disorder',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10584-3',
                          display: '-- Schizophrenia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10585-0',
                          display: '-- Social Phobia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10586-8',
                          display: '-- Dementia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10591-8',
                          display: 'Septicemia',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10522-3',
                          display: 'Stroke/Brain Attack',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10530-6',
                          display: 'Sudden Infant Death Syndrome',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10595-9',
                          display: 'Cause of Death',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10587-6',
                          display: '-- Suicide',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10588-4',
                          display: '-- Accidental Death',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10589-2',
                          display: '-- Other/Unexpected',
                          system: 'http://loinc.org',
                        },
                      },
                    ],
                  },
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54113-6',
                        display: 'Age at Death',
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
                    linkId: '/54114-4/54139-1/54113-6',
                    text: 'Age at Death',
                    enableWhen: [
                      {
                        answerCoding: {
                          code: 'LA32-8',
                          system: 'http://loinc.org',
                        },
                        question: '/54114-4/54139-1',
                        operator: '=',
                      },
                    ],
                    answerOption: [
                      {
                        valueCoding: {
                          code: 'LA10402-8',
                          display: 'Pre-Birth',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10403-6',
                          display: 'Newborn',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10394-7',
                          display: 'Infancy',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10395-4',
                          display: 'Childhood',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10404-4',
                          display: 'Adolescence',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10396-2',
                          display: '20-29',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10397-0',
                          display: '30-39',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10398-8',
                          display: '40-49',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10399-6',
                          display: '50-59',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10400-2',
                          display: 'OVER 60',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA4489-6',
                          display: 'Unknown',
                          system: 'http://loinc.org',
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
                    system: 'http://loinc.org',
                    code: '54121-9',
                    display: 'Twin',
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
                linkId: '/54114-4/54121-9',
                text: 'Twin',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA10427-5',
                      display: 'Yes - Identical (Same)',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10428-3',
                      display: 'Yes - Fraternal (Different)',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54122-7',
                    display: 'Adopted',
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
                linkId: '/54114-4/54122-7',
                text: 'Adopted',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA33-6',
                      display: 'Yes',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54119-3',
                    display: 'Race',
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
                linkId: '/54114-4/54119-3',
                text: 'Race',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA10608-0',
                      display: 'American Indian or Alaska Native',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA6156-9',
                      display: 'Asian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10614-8',
                      display: '-- Asian Indian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10615-5',
                      display: '-- Chinese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10616-3',
                      display: '-- Filipino',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10617-1',
                      display: '-- Japanese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10618-9',
                      display: '-- Korean',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10620-5',
                      display: '-- Vietnamese',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10619-7',
                      display: '-- Other Asian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10610-6',
                      display: 'Black or African American',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10611-4',
                      display: 'Native Hawaiian or Other Pacific Islander',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10623-9',
                      display: '-- Native Hawaiian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10622-1',
                      display: '-- Guamanian',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10621-3',
                      display: '-- Chamorro',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10625-4',
                      display: '-- Samoan',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10624-7',
                      display: '-- Other Pacific Islander',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA4457-3',
                      display: 'White',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10613-0',
                      display: 'Other/Unknown/Refuse To Answer',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54120-1',
                    display: 'Ethnicity',
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
                linkId: '/54114-4/54120-1',
                text: 'Ethnicity',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA6214-6',
                      display: 'Hispanic or Latino',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10599-1',
                      display: '-- Central American',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10600-7',
                      display: '-- Cuban',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10601-5',
                      display: '-- Dominican(Republic)',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10602-3',
                      display: '-- Mexican',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10605-6',
                      display: '-- Puerto Rican',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10606-4',
                      display: '-- South American',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10604-9',
                      display: '-- Other Latin American',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10603-1',
                      display: '-- Other Hispanic/Latino/Spanish',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10597-5',
                      display: 'Non-Hispanic or Latino',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10598-3',
                      display: 'Ashkenazi Jewish',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA10607-2',
                      display: 'Unknown/No answer',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'choice',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54118-5',
                    display: 'Parents related',
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
                linkId: '/54114-4/54118-5',
                text: 'Parents related',
                answerOption: [
                  {
                    valueCoding: {
                      code: 'LA33-6',
                      display: 'Yes',
                      system: 'http://loinc.org',
                    },
                  },
                  {
                    valueCoding: {
                      code: 'LA32-8',
                      display: 'No',
                      system: 'http://loinc.org',
                    },
                  },
                ],
              },
              {
                type: 'group',
                code: [
                  {
                    system: 'http://loinc.org',
                    code: '54117-7',
                    display: 'Diseases history panel',
                  },
                ],
                required: false,
                repeats: true,
                linkId: '/54114-4/54117-7',
                text: 'Diseases history panel',
                item: [
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54116-9',
                        display: 'History of diseases',
                      },
                    ],
                    extension: [
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                        valueCodeableConcept: {
                          coding: [
                            {
                              system: 'http://hl7.org/fhir/questionnaire-item-control',
                              code: 'autocomplete',
                              display: 'Auto-complete',
                            },
                          ],
                          text: 'Auto-complete',
                        },
                      },
                      {
                        url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-externallydefined',
                        valueUri: 'https://clinicaltables.nlm.nih.gov/api/conditions/v3/search',
                      },
                    ],
                    required: false,
                    linkId: '/54114-4/54117-7/54116-9',
                    text: 'History of diseases',
                  },
                  {
                    type: 'choice',
                    code: [
                      {
                        system: 'http://loinc.org',
                        code: '54115-1',
                        display: 'Age range at onset of disease',
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
                    linkId: '/54114-4/54117-7/54115-1',
                    text: 'Age range at onset of disease',
                    answerOption: [
                      {
                        valueCoding: {
                          code: 'LA10402-8',
                          display: 'Pre-Birth',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10403-6',
                          display: 'Newborn',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10394-7',
                          display: 'Infancy',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10395-4',
                          display: 'Childhood',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10404-4',
                          display: 'Adolescence',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10396-2',
                          display: '20-29',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10397-0',
                          display: '30-39',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10398-8',
                          display: '40-49',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10399-6',
                          display: '50-59',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA10400-2',
                          display: 'OVER 60',
                          system: 'http://loinc.org',
                        },
                      },
                      {
                        valueCoding: {
                          code: 'LA4489-6',
                          display: 'Unknown',
                          system: 'http://loinc.org',
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);

export const AHCHRSNScreening = (): JSX.Element => (
  <Document>
    <QuestionnaireForm
      questionnaire={{
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
                        display:
                          'How many times in the past year have you used prescription drugs for non-medical reasons?',
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
                        display:
                          'Over the past 2 weeks, how often have you been bothered by any of the following problems?',
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
                        linkId:
                          '/supplementalQuestions/mentalHealth//supplementalQuestions/mentalHealth/23/metalHealthScore',
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
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
