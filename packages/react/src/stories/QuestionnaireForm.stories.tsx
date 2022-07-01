import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { QuestionnaireForm } from '../QuestionnaireForm';

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
        title: 'Basic Exmple',
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
        title: 'Groups Exmple',
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
