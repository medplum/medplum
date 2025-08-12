// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { MemoryRouter } from 'react-router-dom';
import { act, render, screen } from '../test-utils/render';
import { QuestionnaireResponseDisplay } from './QuestionnaireResponseDisplay';

const medplum = new MockClient();

function setup(questionnaireResponse: QuestionnaireResponse | { reference: string; display?: string }): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <QuestionnaireResponseDisplay questionnaireResponse={questionnaireResponse} />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('QuestionnaireResponseDisplay', () => {
  test('Renders basic string and integer answers', () => {
    setup({
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
    });

    expect(screen.getByText('What is your name?')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('What is your age?')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
  });

  test('Renders multiple answer types', () => {
    setup({
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
    });

    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('170 cm')).toBeInTheDocument();
    expect(screen.getByText('Are you married?')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('Date of Birth')).toBeInTheDocument();
    expect(screen.getByText('3/15/1998')).toBeInTheDocument();
  });

  test('Renders coding answers', () => {
    setup({
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
    });

    expect(screen.getByText('Gender')).toBeInTheDocument();
    expect(screen.getByText('Female')).toBeInTheDocument();
    expect(screen.getByText('Primary Diagnosis')).toBeInTheDocument();
    expect(screen.getByText('Hypertensive disorder')).toBeInTheDocument();
  });

  test('Renders nested items', () => {
    setup({
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
    });

    expect(screen.getByText('Demographics')).toBeInTheDocument();
    expect(screen.getByText('Full Name')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText('Address Information')).toBeInTheDocument();
    expect(screen.getByText('Street Address')).toBeInTheDocument();
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByText('Springfield')).toBeInTheDocument();
    expect(screen.getByText('Medical History')).toBeInTheDocument();
    expect(screen.getByText('Any known allergies?')).toBeInTheDocument();
    expect(screen.getByText('Penicillin, Shellfish')).toBeInTheDocument();
  });

  test('Renders no answers', () => {
    setup({
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
    });

    expect(screen.getByText('This question was not answered')).toBeInTheDocument();
    expect(screen.getByText('Neither was this one')).toBeInTheDocument();
    expect(screen.getAllByText('No answer')).toHaveLength(2);
  });

  test('Renders mixed answered and unanswered questions', () => {
    setup({
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
    });

    expect(screen.getByText('What is your name?')).toBeInTheDocument();
    expect(screen.getByText('Bob Johnson')).toBeInTheDocument();
    expect(screen.getByText('What is your phone number?')).toBeInTheDocument();
    expect(screen.getByText('What is your email address?')).toBeInTheDocument();
    expect(screen.getByText('bob.johnson@example.com')).toBeInTheDocument();
    expect(screen.getByText('Any additional comments?')).toBeInTheDocument();
    expect(screen.getAllByText('No answer')).toHaveLength(2);
  });

  test('Renders kitchen sink with multiple answer types', () => {
    setup({
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
    });

    expect(screen.getByText('Boolean')).toBeInTheDocument();
    expect(screen.getByText('True')).toBeInTheDocument();
    expect(screen.getByText('Decimal')).toBeInTheDocument();
    expect(screen.getByText('123.45')).toBeInTheDocument();
    expect(screen.getByText('Integer')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('1/1/2020')).toBeInTheDocument();
    expect(screen.getByText('Date Time')).toBeInTheDocument();
    expect(screen.getByText('1/1/2020')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('09:40:00')).toBeInTheDocument();
    expect(screen.getByText('String')).toBeInTheDocument();
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('Lorem ipsum')).toBeInTheDocument();
    expect(screen.getByText('URL')).toBeInTheDocument();
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('123 kg')).toBeInTheDocument();
  });

  test('Renders with pages structure', () => {
    setup({
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
    });

    expect(screen.getByText('Page Sequence 1')).toBeInTheDocument();
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Question 2')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Page Sequence 2')).toBeInTheDocument();
    expect(screen.getByText('Question 3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('Question 4')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  test('Handles reference prop', async () => {
    const mockQuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      id: 'test-response',
      status: 'completed',
      item: [
        {
          linkId: 'test-question',
          text: 'Test Question',
          answer: [
            {
              valueString: 'Test Answer',
            },
          ],
        },
      ],
    } as QuestionnaireResponse & { id: string };

    // Mock the medplum client to return our test response
    jest.spyOn(medplum, 'readResource').mockResolvedValue(mockQuestionnaireResponse);

    await act(async () => {
      setup({
        reference: 'QuestionnaireResponse/test-response',
        display: 'Test Questionnaire Response',
      });
    });

    expect(screen.getByText('Test Question')).toBeInTheDocument();
    expect(screen.getByText('Test Answer')).toBeInTheDocument();
  });

  test('Handles null/undefined response gracefully', () => {
    jest.spyOn(medplum, 'readResource').mockResolvedValue(null as any);

    setup({
      reference: 'QuestionnaireResponse/non-existent',
    });

    // Should render without errors even when resource is not found
    expect(document.body).toBeInTheDocument();
  });

  test('Renders default unknown values for unsupported answer types', () => {
    setup({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'unknown-type',
          text: 'Unknown Answer Type',
          answer: [
            {
              valueAttachment: { custom: 'data' } as any,
            },
          ],
        },
      ],
    });

    expect(screen.getByText('Unknown Answer Type')).toBeInTheDocument();
    expect(screen.getByText('[object Object]')).toBeInTheDocument();
  });

  test('Renders boolean false value correctly', () => {
    setup({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      item: [
        {
          linkId: 'boolean-false',
          text: 'Boolean False',
          answer: [
            {
              valueBoolean: false,
            },
          ],
        },
      ],
    });

    expect(screen.getByText('Boolean False')).toBeInTheDocument();
    expect(screen.getByText('False')).toBeInTheDocument();
  });
});
