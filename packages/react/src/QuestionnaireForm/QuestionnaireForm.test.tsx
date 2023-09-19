import { getQuestionnaireAnswers } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { randomUUID } from 'crypto';
import each from 'jest-each';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireForm, QuestionnaireFormProps } from './QuestionnaireForm';

const medplum = new MockClient();

async function setup(args: QuestionnaireFormProps): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <QuestionnaireForm {...args} />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('QuestionnaireForm', () => {
  test('Renders empty', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
      },
      onSubmit: jest.fn(),
    });
    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
  });

  test('Display text', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'display',
            text: 'Hello world',
            type: QuestionnaireItemType.display,
          },
        ],
      },
      onSubmit: jest.fn(),
    });
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  test('Groups', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'group1',
            text: 'Group 1',
            type: QuestionnaireItemType.group,
            item: [
              {
                linkId: 'question1',
                text: 'Question 1',
                type: QuestionnaireItemType.string,
              },
              {
                linkId: 'question2',
                text: 'Question 2',
                type: QuestionnaireItemType.string,
              },
            ],
          },
          {
            linkId: 'group2',
            text: 'Group 2',
            type: QuestionnaireItemType.group,
            item: [
              {
                linkId: 'question3',
                text: 'Question 3',
                type: QuestionnaireItemType.string,
              },
              {
                linkId: 'question4',
                text: 'Question 4',
                type: QuestionnaireItemType.string,
              },
              {
                linkId: 'question5',
                text: 'Question 5',
                type: QuestionnaireItemType.boolean,
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    expect(screen.getByText('Group 1')).toBeDefined();
    expect(screen.getByText('Group 2')).toBeDefined();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'a1' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 2'), { target: { value: 'a2' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 3'), { target: { value: 'a3' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 4'), { target: { value: 'a4' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Question 5'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const response = onSubmit.mock.calls[0][0];
    expect(response.resourceType).toBe('QuestionnaireResponse');
    expect(response.status).toBe('completed');
    expect(response.item).toHaveLength(2);
    expect(response.item[0].item).toHaveLength(2);
    expect(response.item[0].item[0].linkId).toBe('question1');
    expect(response.item[0].item[0].text).toBe('Question 1');
    expect(response.item[1].item[2].linkId).toBe('question5');
    expect(response.item[1].item[2].text).toBe('Question 5');

    const answers = getQuestionnaireAnswers(response);
    expect(answers['question1']).toMatchObject({ valueString: 'a1' });
    expect(answers['question2']).toMatchObject({ valueString: 'a2' });
    expect(answers['question3']).toMatchObject({ valueString: 'a3' });
    expect(answers['question4']).toMatchObject({ valueString: 'a4' });
    expect(answers['question5']).toMatchObject({ valueBoolean: true });
  });

  test('Handles submit', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.string,
            text: 'q1',
          },
          {
            linkId: 'q2',
            type: QuestionnaireItemType.integer,
            text: 'q2',
          },
          {
            linkId: 'q3',
            type: QuestionnaireItemType.date,
            text: 'q3',
          },
          {
            linkId: '', // Silently ignore missing linkId
            type: QuestionnaireItemType.string,
            text: 'q4',
          },
          {
            linkId: 'q5',
            type: '' as unknown as 'string', // Silently ignore missing type
            text: 'q5',
          },
          {
            linkId: 'q6',
            type: QuestionnaireItemType.string,
            text: 'q6',
            initial: [
              {
                valueString: 'initial answer',
              },
            ],
          },
          {
            linkId: 'q7',
            type: QuestionnaireItemType.boolean,
            text: 'q7',
          },
          {
            linkId: 'q8',
            type: QuestionnaireItemType.boolean,
            text: 'q8',
            initial: [
              {
                valueBoolean: true,
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    expect(screen.queryByLabelText('q4')).toBeFalsy();
    expect(screen.queryByLabelText('q5')).toBeFalsy();
    expect((screen.queryByLabelText('q7') as HTMLInputElement).checked).toBe(false);
    expect((screen.queryByLabelText('q8') as HTMLInputElement).checked).toBe(true);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('q1'), { target: { value: 'a1' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('q2'), { target: { value: '2' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('q3'), { target: { value: '2023-03-03' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const response = onSubmit.mock.calls[0][0];
    const answers = getQuestionnaireAnswers(response);
    expect(answers['q1']).toMatchObject({ valueString: 'a1' });
    expect(answers['q2']).toMatchObject({ valueInteger: 2 });
    expect(answers['q3']).toMatchObject({ valueDate: '2023-03-03' });
    expect(answers['q6']).toMatchObject({ valueString: 'initial answer' });
  });

  test('Handles submit (empty)', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
      },
      onSubmit,
    });

    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();

    const response = onSubmit.mock.calls[0][0];
    expect(response.resourceType).toBe('QuestionnaireResponse');
    expect(response.status).toBe('completed');
    expect(response.authored).toBeDefined();
    expect(response.source).toBeDefined();
  });

  each([
    [QuestionnaireItemType.decimal, 'number', '123.456'],
    [QuestionnaireItemType.integer, 'number', '123'],
    [QuestionnaireItemType.date, 'date', '2020-01-01'],
    [QuestionnaireItemType.dateTime, 'datetime-local', '2020-01-01T12:01:01.000'],
    [QuestionnaireItemType.time, 'time', '12:01:01'],
    [QuestionnaireItemType.string, 'text', 'hello'],
    [QuestionnaireItemType.text, 'textarea', 'lorem ipsum'],
    [QuestionnaireItemType.url, 'text', 'https://example.com/'],
    [QuestionnaireItemType.quantity, 'number', '123'],
  ]).test('%s question', async (propertyType: QuestionnaireItemType, inputType: string, value: string) => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: propertyType,
            text: 'q1',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    const input = screen.getByLabelText('q1') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    if (inputType !== 'date' && inputType !== 'datetime-local') {
      // JSDOM does not support date or datetime-local
      expect(input.type).toEqual(inputType);
    }

    await act(async () => {
      fireEvent.change(input, { target: { value } });
    });

    expect(input.value).toBe(value);
  });

  test('Boolean input', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.boolean,
            text: 'q1',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    const input = screen.getByLabelText('q1') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(input);
    });

    expect(input.checked).toBe(true);
  });

  test('Choice input', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
            text: 'q1',
            answerOption: [
              {
                valueString: 'a1',
              },
              {
                valueString: 'a2',
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('q1')).toBeInTheDocument();
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(screen.getByText('a2')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('a1'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    const response1 = onSubmit.mock.calls[0][0];
    const answers1 = getQuestionnaireAnswers(response1);
    expect(answers1['q1']).toMatchObject({ valueString: 'a1' });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('a2'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    const response2 = onSubmit.mock.calls[1][0];
    const answers2 = getQuestionnaireAnswers(response2);
    expect(answers2['q1']).toMatchObject({ valueString: 'a2' });
  });

  test('Choice valueReference default value', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
            text: 'q1',
            answerOption: [
              {
                valueString: 'a1',
              },
              {
                valueString: 'a2',
              },
              {
                valueReference: {
                  reference: 'Patient/123',
                },
              },
              {
                valueReference: {
                  reference: 'Organization/123',
                },
              },
            ],
            initial: [
              {
                valueReference: {
                  reference: 'Organization/123',
                },
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    const radioButton1 = screen.getByLabelText('a1');
    expect(radioButton1).toBeInTheDocument();
    expect((radioButton1 as HTMLInputElement).checked).toBe(false);

    const radioButton2 = screen.getByLabelText('Organization/123');
    expect(radioButton2).toBeInTheDocument();
    expect((radioButton2 as HTMLInputElement).checked).toBe(true);
  });

  test('Open choice input', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.openChoice,
            text: 'q1',
            answerOption: [
              {
                valueString: 'a1',
              },
              {
                valueString: 'a2',
              },
            ],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByText('q1')).toBeInTheDocument();
    expect(screen.getByText('a1')).toBeInTheDocument();
    expect(screen.getByText('a2')).toBeInTheDocument();
  });

  test('Attachment input', async () => {
    const questionnaire: Questionnaire = {
      resourceType: 'Questionnaire',
      id: randomUUID(),
      item: [
        {
          linkId: 'q1',
          type: QuestionnaireItemType.attachment,
          text: 'q1',
        },
      ],
    };

    const expectedResponse: QuestionnaireResponse = {
      resourceType: 'QuestionnaireResponse',
      questionnaire: 'Questionnaire/' + questionnaire.id,
      source: {
        display: 'Alice Smith',
        reference: 'Practitioner/123',
      },
      item: [
        {
          linkId: 'q1',
          text: 'q1',
          answer: [
            {
              valueAttachment: {
                title: 'hello.txt',
                contentType: 'text/plain',
                url: 'https://example.com/binary/123',
              },
            },
          ],
        },
      ],
    };

    const onSubmit = jest.fn();

    await setup({ questionnaire, onSubmit });

    const input = screen.getByText('Upload...');
    expect(input).toBeInTheDocument();

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(screen.getByText('hello.txt')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    const submittedData = onSubmit.mock.calls[0][0];

    expect(submittedData.item[0].answer).toEqual(expectedResponse?.item?.[0].answer);
    expect(submittedData.item[0].text).toEqual(expectedResponse?.item?.[0].text);
    expect(submittedData.item[0].linkId).toEqual(expectedResponse?.item?.[0].linkId);
  });

  test('Reference input', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.reference,
            text: 'q1',
          },
        ],
      },
      onSubmit,
    });

    const input = screen.getByTestId('reference-input-resource-type-input');
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Drop down choice input', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
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
            text: 'q1',
            answerOption: [
              {
                valueString: 'a1',
              },
              {
                valueString: 'a2',
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const dropDown = screen.getByLabelText('q1');
    expect(dropDown).toBeInTheDocument();
    expect(dropDown).toBeInstanceOf(HTMLSelectElement);

    await act(async () => {
      // fireEvent.click(screen.getByLabelText('a1'));
      fireEvent.change(dropDown, { target: { value: 'a1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    const response1 = onSubmit.mock.calls[0][0];
    const answers1 = getQuestionnaireAnswers(response1);
    expect(answers1['q1']).toMatchObject({ valueString: 'a1' });

    await act(async () => {
      fireEvent.change(dropDown, { target: { value: 'a2' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    const response2 = onSubmit.mock.calls[1][0];
    const answers2 = getQuestionnaireAnswers(response2);
    expect(answers2['q1']).toMatchObject({ valueString: 'a2' });
  });

  test('Reference Extensions', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.reference,
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
                      display: 'Organization',
                      code: 'Organization',
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('Patient')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Patient'));
    });
  });

  test('Drop down choice input default value', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
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
            text: 'q1',
            answerOption: [
              {
                valueString: 'a1',
              },
              {
                valueString: 'a2',
              },
            ],
            initial: [
              {
                valueString: 'a2',
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const dropDown = screen.getByLabelText('q1');
    expect(dropDown).toBeInTheDocument();
    expect(dropDown).toBeInstanceOf(HTMLSelectElement);
    expect((dropDown as HTMLSelectElement).value).toBe('a2');
  });

  test('Page Sequence', async () => {
    const visibleQuestion = 'Visible Question';
    const hiddenQuestion = 'Hidden Question';
    await setup({
      questionnaire: {
        id: 'groups-example',
        resourceType: 'Questionnaire',
        title: 'Groups Example',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.group,
            text: 'Visible Sequence',
            item: [
              {
                linkId: 'question1',
                text: visibleQuestion,
                type: 'string',
              },
              {
                linkId: 'question2-string',
                text: 'visible question 2',
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
            linkId: 'q2',
            type: QuestionnaireItemType.group,
            text: 'Hidden Sequence',
            item: [
              {
                linkId: 'question2',
                text: hiddenQuestion,
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
      },
      onSubmit: jest.fn(),
    });

    const visibleQuestionInput = screen.getByLabelText(visibleQuestion);
    fireEvent.change(visibleQuestionInput, { target: { value: 'Test Value' } });

    expect((visibleQuestionInput as HTMLInputElement).value).toBe('Test Value');

    const question2StringInput = screen.getByLabelText('visible question 2');
    fireEvent.change(question2StringInput, { target: { value: 'Test Value for Question2-String' } });

    expect((question2StringInput as HTMLInputElement).value).toBe('Test Value for Question2-String');

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // Check that the texts for visibleQuestion and question2-string are no longer in the document.
    expect(screen.queryByText(visibleQuestion)).not.toBeInTheDocument();
    expect(screen.queryByText('visible question 2')).not.toBeInTheDocument();

    // Check that the hidden text is now visible.
    expect(screen.getByText(hiddenQuestion)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });

    // Check that the values in the visibleQuestion and question2-string inputs are still the same.
    const updatedVisibleQuestionInput = screen.getByLabelText(visibleQuestion) as HTMLInputElement;
    expect(updatedVisibleQuestionInput.value).toBe('Test Value');

    const updatedQuestion2StringInput = screen.getByLabelText('visible question 2') as HTMLInputElement;
    expect(updatedQuestion2StringInput.value).toBe('Test Value for Question2-String');
  });

  test('Page Sequence with non page items in root', async () => {
    const visibleQuestion = 'Visible Question';
    const hiddenQuestion = 'Hidden Question';
    await setup({
      questionnaire: {
        id: 'groups-example',
        resourceType: 'Questionnaire',
        title: 'Groups Example',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.group,
            text: 'Visible Sequence',
            item: [
              {
                linkId: 'question1',
                text: visibleQuestion,
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
            linkId: 'q2',
            text: 'Question Choice',
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
            linkId: 'q3',
            type: QuestionnaireItemType.group,
            text: 'Hidden Sequence',
            item: [
              {
                linkId: 'question2',
                text: hiddenQuestion,
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
      },
      onSubmit: jest.fn(),
    });
    // The form should render
    expect(screen.getByText(visibleQuestion)).toBeInTheDocument();

    // The hidden text should be hidden
    expect(screen.queryByText(hiddenQuestion)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    expect(screen.queryByText(visibleQuestion)).not.toBeInTheDocument();

    // The hidden text should still not be visible
    expect(screen.queryByText(hiddenQuestion)).not.toBeInTheDocument();

    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getByText('Back')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    // The hidden text should now be visible
    expect(screen.getByText(hiddenQuestion)).toBeInTheDocument();

    expect(screen.getByText('Back')).toBeInTheDocument();
  });

  test('Value Set Choice', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        id: 'value-set-example',
        title: 'Valueset',
        item: [
          {
            linkId: 'q1',
            text: 'Value Set',
            type: 'choice',
            answerValueSet: 'http://example.com/valueset',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    const dropDown = screen.getByText('Valueset');

    await act(async () => {
      fireEvent.click(dropDown);
    });

    await act(async () => {
      fireEvent.change(dropDown, { target: 'Test Display' });
    });
  });

  test('Repeated Choice Dropdown', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        id: 'default-values',
        title: 'Default Values Example',
        item: [
          {
            id: 'choice',
            linkId: 'choice',
            text: 'choice',
            type: 'choice',
            answerOption: [
              {
                valueString: 'Yes',
              },
              {
                valueString: 'No',
              },
            ],
            repeats: true,
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
      onSubmit: jest.fn(),
    });

    const dropDown = screen.getByText('choice');

    await act(async () => {
      fireEvent.click(dropDown);
    });

    await act(async () => {
      fireEvent.change(dropDown, { target: 'Yes' });
    });

    await act(async () => {
      fireEvent.change(dropDown, { target: 'No' });
    });
  });

  test('Conditional question', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        id: 'enable-when',
        title: 'Enable When Example',
        item: [
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
            linkId: 'q2',
            type: 'display',
            text: 'Hidden Text',
            enableWhen: [
              {
                question: 'q1',
                operator: '=',
                answerString: 'Yes',
              },
            ],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    // The form should render
    expect(screen.getByText('Question 1')).toBeInTheDocument();

    // The hidden text should be hidden
    expect(screen.queryByText('Hidden Text')).not.toBeInTheDocument();

    // Click on "No"
    await act(async () => {
      fireEvent.click(screen.getByLabelText('No'));
    });

    // The hidden text should still be hidden
    expect(screen.queryByText('Hidden Text')).not.toBeInTheDocument();

    // Click on "Yes"
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Yes'));
    });

    // Now the hidden text should be visible
    expect(screen.queryByText('Hidden Text')).toBeInTheDocument();
  });

  test('repeatableQuestion', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        id: 'repeatable-when',
        title: 'repeatable Questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
            repeats: true,
          },
          {
            linkId: 'group1',
            text: 'Group',
            type: 'group',
            repeats: true,
            item: [
              {
                linkId: 'question2',
                text: 'Question 2',
                type: 'string',
              },
            ],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'answer' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add Group'));
    });

    expect(screen.getAllByText('Group').length).toBe(2);

    expect(screen.getAllByText('Question 2').length).toBe(2);
  });
});
