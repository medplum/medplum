import { Meta } from '@storybook/react';
import React from 'react';
import { Document } from '../Document';
import { QuestionnaireForm } from '../QuestionnaireForm';

export default {
  title: 'Medplum/QuestionnaireForm',
  component: QuestionnaireForm,
} as Meta;

export const Basic = () => (
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

export const Groups = () => (
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

export const MultipleChoice = () => (
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

export const KitchenSink = () => (
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
            text: 'boolean',
          },
          {
            linkId: 'decimal',
            type: 'decimal',
            text: 'decimal',
          },
          {
            linkId: 'integer',
            type: 'integer',
            text: 'integer',
          },
          {
            linkId: 'date',
            type: 'date',
            text: 'date',
          },
          {
            linkId: 'dateTime',
            type: 'dateTime',
            text: 'dateTime',
          },
          {
            linkId: 'time',
            type: 'time',
            text: 'time',
          },
          {
            linkId: 'string',
            type: 'string',
            text: 'string',
          },
          {
            linkId: 'text',
            type: 'text',
            text: 'text',
          },
          {
            linkId: 'url',
            type: 'url',
            text: 'url',
          },
          {
            linkId: 'choice',
            type: 'choice',
            text: 'choice',
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
            text: 'open-choice',
          },
          {
            linkId: 'attachment',
            type: 'attachment',
            text: 'attachment',
          },
          {
            linkId: 'reference',
            type: 'reference',
            text: 'reference',
          },
          {
            linkId: 'quantity',
            type: 'quantity',
            text: 'quantity',
          },
        ],
      }}
      onSubmit={(formData: any) => {
        console.log('submit', formData);
      }}
    />
  </Document>
);
