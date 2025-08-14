// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Meta } from '@storybook/react';
import { JSX } from 'react';
import { Document } from '../Document/Document';
import { QuestionnaireResponseDisplay } from './QuestionnaireResponseDisplay';

export default {
  title: 'Medplum/QuestionnaireResponseDisplay',
  component: QuestionnaireResponseDisplay,
} as Meta;

export const Basic = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'name',
            text: 'What is your name?',
            answer: [
              {
                valueString: 'John Doe',
              },
            ],
          },
          {
            linkId: 'age',
            text: 'What is your age?',
            answer: [
              {
                valueInteger: 30,
              },
            ],
          },
        ],
      }}
    />
  </Document>
);

export const MultipleAnswerTypes = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'name',
            text: 'Full Name',
            answer: [
              {
                valueString: 'Alice Smith',
              },
            ],
          },
          {
            linkId: 'age',
            text: 'Age',
            answer: [
              {
                valueInteger: 25,
              },
            ],
          },
          {
            linkId: 'height',
            text: 'Height',
            answer: [
              {
                valueQuantity: {
                  value: 170,
                  unit: 'cm',
                  system: 'http://unitsofmeasure.org',
                  code: 'cm',
                },
              },
            ],
          },
          {
            linkId: 'married',
            text: 'Are you married?',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            linkId: 'birthdate',
            text: 'Date of Birth',
            answer: [
              {
                valueDateTime: '1998-03-15',
              },
            ],
          },
        ],
      }}
    />
  </Document>
);

export const NestedItems = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'demographics',
            text: 'Demographics',
            item: [
              {
                linkId: 'name',
                text: 'Full Name',
                answer: [
                  {
                    valueString: 'Jane Doe',
                  },
                ],
              },
              {
                linkId: 'address',
                text: 'Address Information',
                item: [
                  {
                    linkId: 'street',
                    text: 'Street Address',
                    answer: [
                      {
                        valueString: '123 Main St',
                      },
                    ],
                  },
                  {
                    linkId: 'city',
                    text: 'City',
                    answer: [
                      {
                        valueString: 'Springfield',
                      },
                    ],
                  },
                ],
              },
            ],
          },
          {
            linkId: 'medical',
            text: 'Medical History',
            item: [
              {
                linkId: 'allergies',
                text: 'Any known allergies?',
                answer: [
                  {
                    valueString: 'Penicillin, Shellfish',
                  },
                ],
              },
            ],
          },
        ],
      }}
    />
  </Document>
);

export const WithCodingAnswers = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'gender',
            text: 'Gender',
            answer: [
              {
                valueCoding: {
                  system: 'http://hl7.org/fhir/administrative-gender',
                  code: 'female',
                  display: 'Female',
                },
              },
            ],
          },
          {
            linkId: 'diagnosis',
            text: 'Primary Diagnosis',
            answer: [
              {
                valueCoding: {
                  system: 'http://snomed.info/sct',
                  code: '38341003',
                  display: 'Hypertensive disorder',
                },
              },
            ],
          },
        ],
      }}
    />
  </Document>
);

export const NoAnswers = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'completed',
        item: [
          {
            linkId: 'unanswered-1',
            text: 'This question was not answered',
          },
          {
            linkId: 'unanswered-2',
            text: 'Neither was this one',
          },
        ],
      }}
    />
  </Document>
);

export const MixedAnsweredAndUnanswered = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [
          {
            linkId: 'name',
            text: 'What is your name?',
            answer: [
              {
                valueString: 'Bob Johnson',
              },
            ],
          },
          {
            linkId: 'phone',
            text: 'What is your phone number?',
            // No answer provided
          },
          {
            linkId: 'email',
            text: 'What is your email address?',
            answer: [
              {
                valueString: 'bob.johnson@example.com',
              },
            ],
          },
          {
            linkId: 'comments',
            text: 'Any additional comments?',
            // No answer provided
          },
        ],
      }}
    />
  </Document>
);

export const KitchenSink = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        questionnaire: 'Questionnaire/kitchen-sink',
        item: [
          {
            id: 'id-2',
            linkId: 'boolean',
            text: 'Boolean',
            answer: [
              {
                valueBoolean: true,
              },
            ],
          },
          {
            id: 'id-3',
            linkId: 'decimal',
            text: 'Decimal',
            answer: [
              {
                valueDecimal: 123.45,
              },
            ],
          },
          {
            id: 'id-4',
            linkId: 'integer',
            text: 'Integer',
            answer: [
              {
                valueInteger: 123,
              },
            ],
          },
          {
            id: 'id-5',
            linkId: 'date',
            text: 'Date',
            answer: [
              {
                valueDate: '2020-01-01',
              },
            ],
          },
          {
            id: 'id-6',
            linkId: 'dateTime',
            text: 'Date Time',
            answer: [
              {
                valueDateTime: '2020-01-01T00:00:00Z',
              },
            ],
          },
          {
            id: 'id-7',
            linkId: 'time',
            text: 'Time',
            answer: [
              {
                valueTime: '09:40:00',
              },
            ],
          },
          {
            id: 'id-8',
            linkId: 'string',
            text: 'String',
            answer: [
              {
                valueString: 'foo',
              },
            ],
          },
          {
            id: 'id-9',
            linkId: 'text',
            text: 'Text',
            answer: [
              {
                valueString: 'Lorem ipsum',
              },
            ],
          },
          {
            id: 'id-10',
            linkId: 'url',
            text: 'URL',
            answer: [
              {
                valueUri: 'https://example.com',
              },
            ],
          },
          {
            id: 'id-11',
            linkId: 'choice',
            text: 'Choice',
            answer: [
              {
                valueReference: {
                  reference: 'Organization/123',
                  display: 'Test Organization',
                },
              },
            ],
          },
          {
            id: 'id-12',
            linkId: 'value-set-choice',
            text: 'Value Set Choice',
            answer: [
              {
                valueCoding: {
                  system: 'x',
                  code: 'test-code',
                  display: 'Test Display',
                },
              },
            ],
          },
          {
            id: 'id-13',
            linkId: 'open-choice',
            text: 'Open Choice',
            answer: [
              {
                valueCoding: {
                  system: 'x',
                  code: 'test-code',
                  display: 'Test Display',
                },
              },
            ],
          },
          {
            id: 'id-14',
            linkId: 'attachment',
            text: 'Attachment',
            answer: [
              {
                valueAttachment: {
                  contentType: 'image/png',
                },
              },
            ],
          },
          {
            id: 'id-15',
            linkId: 'reference',
            text: 'Reference',
            answer: [
              {
                valueReference: {
                  reference: 'Organization/123',
                  display: 'Test Organization',
                },
              },
            ],
          },
          {
            id: 'id-17',
            linkId: 'quantity',
            text: 'Quantity',
            answer: [
              {
                valueQuantity: {
                  value: 123,
                  unit: 'kg',
                },
              },
            ],
          },
        ],
        status: 'completed',
      }}
    />
  </Document>
);

export const WithPages = (): JSX.Element => (
  <Document>
    <QuestionnaireResponseDisplay
      questionnaireResponse={{
        resourceType: 'QuestionnaireResponse',
        questionnaire: 'Questionnaire/pages-example',
        item: [
          {
            id: 'id-25',
            linkId: 'group1',
            text: 'Page Sequence 1',
            item: [
              {
                id: 'id-26',
                linkId: 'question1',
                text: 'Question 1',
                answer: [
                  {
                    valueString: '1',
                  },
                ],
              },
              {
                id: 'id-27',
                linkId: 'question2',
                text: 'Question 2',
                answer: [
                  {
                    valueString: '2',
                  },
                ],
              },
              {
                id: 'id-28',
                linkId: 'q1',
                text: 'Question 1',
                answer: [
                  {
                    valueString: 'Yes',
                  },
                ],
              },
              {
                id: 'id-29',
                linkId: 'question1-4',
                text: 'Multi Select Question',
                answer: [
                  {
                    valueString: 'value2',
                  },
                ],
              },
            ],
          },
          {
            id: 'id-30',
            linkId: 'group2',
            text: 'Page Sequence 2',
            item: [
              {
                id: 'id-31',
                linkId: 'question3',
                text: 'Question 3',
                answer: [
                  {
                    valueString: '5',
                  },
                ],
              },
              {
                id: 'id-32',
                linkId: 'question4',
                text: 'Question 4',
                answer: [
                  {
                    valueString: '6',
                  },
                ],
              },
            ],
          },
        ],
        status: 'completed',
        source: {
          reference: 'Practitioner/123',
          display: 'Alice Smith',
        },
        authored: '2025-07-23T21:18:24.488Z',
      }}
    />
  </Document>
);
