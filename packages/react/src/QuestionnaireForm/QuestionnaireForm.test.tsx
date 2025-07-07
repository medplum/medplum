import { getAllQuestionnaireAnswers, getQuestionnaireAnswers } from '@medplum/core';
import { Extension, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { randomUUID } from 'crypto';
import each from 'jest-each';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireForm, QuestionnaireFormProps } from './QuestionnaireForm';

const medplum = new MockClient();

const pageExtension: Extension[] = [
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
];

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
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
      },
      onSubmit: jest.fn(),
    });
    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
  });

  test('Display text', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
        status: 'active',
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
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

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

  test('Groups with QuestionnaireResponse', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
      questionnaireResponse: {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [
          {
            id: 'id-2',
            linkId: 'group1',
            text: 'Group 1',
            item: [
              {
                id: 'id-3',
                linkId: 'question1',
                text: 'Question 1',
                answer: [
                  {
                    valueString: 'a1',
                  },
                ],
              },
              {
                id: 'id-4',
                linkId: 'question2',
                text: 'Question 2',
                answer: [
                  {
                    valueString: 'a2',
                  },
                ],
              },
            ],
            answer: [],
          },
          {
            id: 'id-5',
            linkId: 'group2',
            text: 'Group 2',
            item: [
              {
                id: 'id-6',
                linkId: 'question3',
                text: 'Question 3',
                answer: [
                  {
                    valueString: 'a3',
                  },
                ],
              },
              {
                id: 'id-7',
                linkId: 'question4',
                text: 'Question 4',
                answer: [
                  {
                    valueString: 'a4',
                  },
                ],
              },
              {
                id: 'id-8',
                linkId: 'question5',
                text: 'Question 5',
                answer: [
                  {
                    valueBoolean: true,
                  },
                ],
              },
            ],
            answer: [],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();
    expect(screen.getByText('Group 1')).toBeDefined();
    expect(screen.getByText('Group 2')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const responseAuto = onSubmit.mock.calls[0][0];
    expect(responseAuto.resourceType).toBe('QuestionnaireResponse');
    expect(responseAuto.status).toBe('completed');

    const answersAuto = getQuestionnaireAnswers(responseAuto);
    expect(answersAuto['question1']).toMatchObject({ valueString: 'a1' });
    expect(answersAuto['question2']).toMatchObject({ valueString: 'a2' });
    expect(answersAuto['question3']).toMatchObject({ valueString: 'a3' });
    expect(answersAuto['question4']).toMatchObject({ valueString: 'a4' });
    expect(answersAuto['question5']).toMatchObject({ valueBoolean: true });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 1'), { target: { value: 'a11' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 2'), { target: { value: 'a22' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 3'), { target: { value: 'a33' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Question 4'), { target: { value: 'a44' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Question 5'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    const responseManual = onSubmit.mock.calls[1][0];
    const answersManual = getQuestionnaireAnswers(responseManual);
    expect(answersManual['question1']).toMatchObject({ valueString: 'a11' });
    expect(answersManual['question2']).toMatchObject({ valueString: 'a22' });
    expect(answersManual['question3']).toMatchObject({ valueString: 'a33' });
    expect(answersManual['question4']).toMatchObject({ valueString: 'a44' });
    expect(answersManual['question5']).toMatchObject({ valueBoolean: false });
  });

  test('Handles submit', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        url: 'https://example.com/Questionnaire/123',
        status: 'active',
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
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    const answers = getQuestionnaireAnswers(response);
    expect(response.resourceType).toBe('QuestionnaireResponse');
    expect(response.status).toBe('completed');
    expect(response.questionnaire).toBe('https://example.com/Questionnaire/123');
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
        id: '456',
        status: 'active',
      },
      onSubmit,
    });

    expect(screen.getByTestId('questionnaire-form')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    expect(response.resourceType).toBe('QuestionnaireResponse');
    expect(response.status).toBe('completed');
    expect(response.questionnaire).toBe('Questionnaire/456');
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
        status: 'active',
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
        status: 'active',
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
        status: 'active',
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
      fireEvent.click(screen.getByText('Submit'));
    });

    const response1 = onSubmit.mock.calls[0][0];
    const answers1 = getQuestionnaireAnswers(response1);
    expect(answers1['q1']).toMatchObject({ valueString: 'a1' });

    await act(async () => {
      fireEvent.click(screen.getByLabelText('a2'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
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
        status: 'active',
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

  test('Choice valueCoding default value', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
                valueCoding: {
                  code: 'patient',
                },
              },
              {
                valueCoding: {
                  code: 'organization',
                },
              },
            ],
            initial: [
              {
                valueCoding: {
                  code: 'patient',
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

    const radioButton2 = screen.getByLabelText('patient');
    expect(radioButton2).toBeInTheDocument();
    expect((radioButton2 as HTMLInputElement).checked).toBe(true);
  });

  test('Open choice input', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
      status: 'active',
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
      status: 'completed',
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
                url: expect.stringContaining('https://example.com/binary/'),
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
      fireEvent.click(screen.getByText('Submit'));
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
        status: 'active',
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

    const input = screen.getByPlaceholderText('Resource Type');
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  test('Drop down choice input', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
      fireEvent.click(screen.getByText('Submit'));
    });

    const response1 = onSubmit.mock.calls[0][0];
    const answers1 = getQuestionnaireAnswers(response1);
    expect(answers1['q1']).toMatchObject({ valueString: 'a1' });

    await act(async () => {
      fireEvent.change(dropDown, { target: { value: 'a2' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    const response2 = onSubmit.mock.calls[1][0];
    const answers2 = getQuestionnaireAnswers(response2);
    expect(answers2['q1']).toMatchObject({ valueString: 'a2' });

    await act(async () => {
      fireEvent.change(dropDown, { target: { value: '' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    const response3 = onSubmit.mock.calls[2][0];
    const answers3 = getQuestionnaireAnswers(response3);
    expect(answers3['q1']).toMatchObject({});
  });

  test('referenceResource extension with valueCodeableConcept', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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

  test('referenceResource extension with valueCode', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.reference,
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCode: 'Patient',
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.queryByText('Patient')).not.toBeInTheDocument();
  });

  test('Drop down choice input default value', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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

  test('Drop down choice input default reference value', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const dropDown = screen.getByLabelText('q1');
    expect(dropDown).toBeInTheDocument();
    expect(dropDown).toBeInstanceOf(HTMLSelectElement);
    expect((dropDown as HTMLSelectElement).value).toBe('Test Organization');
  });

  test('Page Sequence', async () => {
    const visibleQuestion = 'Visible Question';
    const hiddenQuestion = 'Hidden Question';
    await setup({
      questionnaire: {
        id: 'groups-example',
        resourceType: 'Questionnaire',
        status: 'active',
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
                required: true,
              },
              {
                linkId: 'question2-string',
                text: 'visible question 2',
                type: 'string',
              },
            ],
            extension: pageExtension,
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
            extension: pageExtension,
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    const visibleQuestionInput = screen.getByLabelText(visibleQuestion + ' *');
    expect(visibleQuestionInput).toBeInTheDocument();

    const nextButton = screen.getByText('Next');
    expect(nextButton).toBeInTheDocument();

    // Try to click "Next" without answering the question.
    // This should fail, because the question is required.
    await act(async () => {
      fireEvent.click(nextButton);
    });

    expect(visibleQuestionInput).toBeInTheDocument();

    fireEvent.change(visibleQuestionInput, { target: { value: 'Test Value' } });

    expect((visibleQuestionInput as HTMLInputElement).value).toBe('Test Value');

    const question2StringInput = screen.getByLabelText('visible question 2');
    fireEvent.change(question2StringInput, { target: { value: 'Test Value for Question2-String' } });

    expect((question2StringInput as HTMLInputElement).value).toBe('Test Value for Question2-String');

    await act(async () => {
      fireEvent.click(nextButton);
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
    const updatedVisibleQuestionInput = screen.getByLabelText(visibleQuestion + ' *') as HTMLInputElement;
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
        status: 'active',
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
            extension: pageExtension,
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
            extension: pageExtension,
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
    const onSubmit = jest.fn();
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
      onSubmit,
    });

    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];

    const answer = getQuestionnaireAnswers(response);
    expect(answer['q1']).toMatchObject({
      valueCoding: { code: 'test-code', display: 'Test Display', system: 'x' },
    });
  });

  test('Dropdown with no value set or options', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'no-options-dropdown',
        title: 'No Options Dropdown Example',
        item: [
          {
            linkId: 'choices',
            text: 'Choices',
            type: 'choice',
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

    expect(screen.getByPlaceholderText('No Answers Defined')).toBeInTheDocument();
  });

  test('Value Set Checkbox', async () => {
    const onSubmit = jest.fn();

    // Mock the value set expansion to return more than 30 items
    const mockValueSet = {
      resourceType: 'ValueSet',
      expansion: {
        contains: Array.from({ length: 35 }, (_, i) => ({
          system: 'x',
          code: `test-code-${i}`,
          display: `Test Display ${i}`,
        })),
      },
    };

    // Mock the medplum client's valueSetExpand method
    medplum.valueSetExpand = jest.fn().mockResolvedValue(mockValueSet);

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'value-set-checkbox',
        title: 'Value Set Checkbox',
        item: [
          {
            linkId: 'q1',
            text: 'Value Set Checkbox',
            type: 'choice',
            answerValueSet: 'http://example.com/valueset',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'check-box',
                      display: 'Check Box',
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

    // Wait for value set to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Check that checkboxes are rendered
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBeGreaterThan(0);

    // Verify that the cutoff message is shown
    const cutoffMessage = screen.getByText(/Showing first 30 options/);
    expect(cutoffMessage).toBeInTheDocument();

    // Click the first checkbox
    await act(async () => {
      fireEvent.click(checkboxes[0]);
    });

    // Click the second checkbox
    await act(async () => {
      fireEvent.click(checkboxes[1]);
    });

    // Click the third checkbox
    await act(async () => {
      fireEvent.click(checkboxes[2]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    const answer = getAllQuestionnaireAnswers(response);
    expect(answer['q1']).toBeDefined();
    expect(answer['q1'][0]).toMatchObject({
      valueCoding: { code: 'test-code-0', display: 'Test Display 0', system: 'x' },
    });
    expect(answer['q1'][2]).toMatchObject({
      valueCoding: { code: 'test-code-2', display: 'Test Display 2', system: 'x' },
    });
  });

  test('Value Set Radio Button', async () => {
    const onSubmit = jest.fn();
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'value-set-radio',
        title: 'Value Set Radio',
        item: [
          {
            linkId: 'q1',
            text: 'Value Set Radio',
            type: 'choice',
            answerValueSet: 'http://example.com/valueset',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'radio-button',
                      display: 'Radio Button',
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

    // Wait for value set to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Check that radio buttons are rendered
    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons.length).toBeGreaterThan(0);

    // Click the first radio button
    await act(async () => {
      fireEvent.click(radioButtons[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    const answer = getQuestionnaireAnswers(response);
    expect(answer['q1']).toMatchObject({
      valueCoding: { code: 'test-code-0', display: 'Test Display 0', system: 'x' },
    });
  });

  test('Non-Value Set Checkbox', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'non-valueset-checkbox',
        title: 'Non-Value Set Checkbox',
        item: [
          {
            linkId: 'q1',
            text: 'Non-Value Set Checkbox',
            type: 'choice',
            repeats: true,
            answerOption: [
              {
                valueString: 'Option 1',
              },
              {
                valueString: 'Option 2',
              },
              {
                valueString: 'Option 3',
              },
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'check-box',
                      display: 'Check Box',
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

    // Check that checkboxes are rendered
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3);

    // Select multiple options
    await act(async () => {
      fireEvent.click(checkboxes[0]); // Option 1
      fireEvent.click(checkboxes[2]); // Option 3
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].answer).toHaveLength(2);
    expect(response.item[0].answer[0]).toMatchObject({ valueString: 'Option 1' });
    expect(response.item[0].answer[1]).toMatchObject({ valueString: 'Option 3' });
  });

  test('Checkbox Selection and Deselection', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'checkbox-selection-deselection',
        title: 'Checkbox Selection and Deselection',
        item: [
          {
            linkId: 'q1',
            text: 'Select Options',
            type: 'choice',
            repeats: true,
            answerOption: [
              {
                valueString: 'Option 1',
              },
              {
                valueString: 'Option 2',
              },
              {
                valueString: 'Option 3',
              },
            ],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'check-box',
                      display: 'Check Box',
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

    // Check that checkboxes are rendered
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.length).toBe(3);

    // Select all options
    await act(async () => {
      checkboxes.forEach((checkbox) => {
        fireEvent.click(checkbox);
      });
    });

    // Submit with all options selected
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    // Verify all options are selected in the response
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const response1 = onSubmit.mock.calls[0][0];
    expect(response1.item[0].answer).toHaveLength(3);
    expect(response1.item[0].answer).toEqual(
      expect.arrayContaining([{ valueString: 'Option 1' }, { valueString: 'Option 2' }, { valueString: 'Option 3' }])
    );

    // Deselect all options
    await act(async () => {
      checkboxes.forEach((checkbox) => {
        fireEvent.click(checkbox);
      });
    });

    // Submit with no options selected
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    // Verify no options are selected in the response
    expect(onSubmit).toHaveBeenCalledTimes(2);
    const response2 = onSubmit.mock.calls[1][0];
    expect(response2.item[0].answer).toHaveLength(1);
    expect(response2.item[0].answer).toEqual(expect.arrayContaining([{}]));
  });

  test('Multi-Select Dropdown Value Set', async () => {
    const onSubmit = jest.fn();

    // Mock the value set expansion to return multiple items
    const mockValueSet = {
      resourceType: 'ValueSet',
      expansion: {
        contains: Array.from({ length: 5 }, (_, i) => ({
          system: 'x',
          code: `test-code-${i}`,
          display: `Test Display ${i}`,
        })),
      },
    };

    // Mock the medplum client's valueSetExpand method
    medplum.valueSetExpand = jest.fn().mockResolvedValue(mockValueSet);

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'multi-select-dropdown-valueset',
        title: 'Multi-Select Dropdown Value Set',
        item: [
          {
            linkId: 'q1',
            text: 'Multi-Select Dropdown Value Set',
            type: 'choice',
            repeats: true,
            answerValueSet: 'http://example.com/valueset',
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
                },
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    // Wait for value set to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    const searchInput = screen.getByPlaceholderText('Select items');
    expect(searchInput).toBeInTheDocument();

    // Select first option
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Test Display 0' } });
    });

    // Wait for options to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Select the first option
    await act(async () => {
      fireEvent.keyDown(searchInput, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    });

    // Clear input for second selection
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: '' } });
    });

    // Select second option
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'Test Display 2' } });
    });

    // Wait for options to load
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Select the second option (press ArrowDown twice to get to the third option)
    await act(async () => {
      fireEvent.keyDown(searchInput, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'ArrowDown', code: 'ArrowDown' });
      fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    });

    // Submit the form
    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].answer).toHaveLength(2);
    expect(response.item[0].answer[0]).toMatchObject({
      valueCoding: { code: 'test-code-0', display: 'Test Display 0', system: 'x' },
    });
    expect(response.item[0].answer[1]).toMatchObject({
      valueCoding: { code: 'test-code-2', display: 'Test Display 2', system: 'x' },
    });
  });

  test('Repeated Choice Dropdown', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
        status: 'active',
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

  test('Multi Select', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'multi-select',
        title: 'Multi Select Example',
        item: [
          {
            linkId: 'group1',
            type: 'group',
            text: 'Group 1',
            item: [
              {
                linkId: 'q1',
                type: QuestionnaireItemType.choice,
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
            extension: pageExtension,
          },
          {
            linkId: 'group2',
            type: 'group',
            text: 'Group 2',
            extension: pageExtension,
            item: [
              {
                linkId: 'string',
                type: 'string',
                text: 'string',
              },
            ],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('Select items');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toBeInstanceOf(HTMLInputElement);

    await act(async () => {
      fireEvent.change(searchInput, { target: { value: 'a1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Next'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Back'));
    });

    const searchInput1 = screen.getByPlaceholderText('Select items');
    expect(searchInput1).toBeInTheDocument();
  });

  test('Multi Select shows with no data', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
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
            text: 'q1',
            answerOption: [],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('No Answers Defined');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
  });

  test('Multi Select Code', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'multi-select',
                      display: 'Multi Select',
                    },
                  ],
                  text: 'Multi Select',
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

  test('Multi Select Code shows with no data', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
                      code: 'multi-select',
                      display: 'Multi Select',
                    },
                  ],
                  text: 'Multi Select',
                },
              },
            ],
            text: 'q1',
            answerOption: [],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByText('q1')).toBeInTheDocument();

    const searchInput = screen.getByPlaceholderText('No Answers Defined');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toBeInstanceOf(HTMLInputElement);
  });

  test('Nested repeat', async () => {
    const onSubmit = jest.fn();
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'pages-example',
        title: 'Pages Example',
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
                    linkId: 'question1',
                    type: 'string',
                    text: 'question1',
                  },
                ],
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('Outside Group')).toBeInTheDocument();

    const outsideGroupButton = screen.getAllByText('Add Group: Outside Group');
    const insideGroupButton = screen.getAllByText('Add Group: Inside Group');

    expect(outsideGroupButton).toHaveLength(1);
    expect(insideGroupButton).toHaveLength(1);

    await act(async () => {
      fireEvent.click(outsideGroupButton[0]);
    });

    expect(screen.getAllByText('Outside Group').length).toBe(2);
    expect(screen.getAllByText('Inside Group').length).toBe(2);

    const stringInputs = screen.getAllByText('question1');
    expect(stringInputs).toHaveLength(2);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('question1'), { target: { value: 'answer1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].item[0].item[0].answer[0].valueString).toEqual('answer1');
  });

  test('repeatableQuestion', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
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
            text: 'Question Group',
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
      fireEvent.click(screen.getByText('Add Group: Question Group'));
    });

    expect(screen.getAllByText('Question Group').length).toBe(2);

    expect(screen.getAllByText('Question 2').length).toBe(2);
  });

  test('No Answers Defined', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'no-answers',
        title: 'No Answers Example',
        item: [
          {
            linkId: 'choices',
            text: 'Choices',
            type: 'choice',
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

    expect(screen.getByPlaceholderText('No Answers Defined')).toBeInTheDocument();
  });

  test('Empty Array of Answer Options', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'empty-answers',
        title: 'Empty Answers Example',
        item: [
          {
            linkId: 'choices',
            text: 'Choices',
            type: 'choice',
            answerOption: [],
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

    expect(screen.getByPlaceholderText('No Answers Defined')).toBeInTheDocument();
  });

  test('Empty Answer Options for Radio', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'empty-radio',
        title: 'Empty Radio Example',
        item: [
          {
            linkId: 'choices',
            text: 'Choices',
            type: 'choice',
            answerOption: [],
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByPlaceholderText('No Answers Defined')).toBeInTheDocument();
  });

  test('Reference filter', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'reference-filter',
        item: [
          {
            linkId: 'q1',
            type: 'reference',
            text: 'Question',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
                valueCode: 'Observation',
              },
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceFilter',
                valueString: 'subject=$subj',
              },
            ],
          },
        ],
      },
      subject: { reference: 'Patient/123' },
      onSubmit: jest.fn(),
    });

    // Add a spy on medplum.searchResources
    const searchResources = jest.spyOn(medplum, 'searchResources');

    // Get the search input
    const input = screen.getByRole('searchbox') as HTMLInputElement;

    // Enter "Simpson"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('Test 1')).toBeDefined();
    expect(searchResources).toHaveBeenCalledTimes(1);
    expect(searchResources.mock.calls[0][0]).toBe('Observation');
    expect(searchResources.mock.calls[0][1]).toBeInstanceOf(URLSearchParams);

    const params = searchResources.mock.calls[0][1] as URLSearchParams;
    expect(params.get('subject')).toBe('Patient/123');
    expect(params.get('code')).toBe('Test');
  });

  test('Questionnaire CalculatedExpression with boolean field', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'temperature-threshold',
        title: 'Temperature Threshold Check',
        item: [
          {
            id: 'id-1',
            linkId: 'q1',
            type: 'string',
            text: 'Fahrenheit',
          },
          {
            id: 'id-2',
            linkId: 'q2',
            type: 'boolean',
            text: 'Is temperature over 120?',
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                valueExpression: {
                  language: 'text/fhirpath',
                  expression:
                    "iif(%resource.item.where(linkId='q1').answer.value.empty(), false, (%resource.item.where(linkId='q1').answer.value.toDecimal() > 120))",
                },
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fahrenheit'), { target: { value: '125' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    const answers = getQuestionnaireAnswers(response);

    expect(answers['q1']).toMatchObject({ valueString: '125' });
    expect(answers['q2']).toMatchObject({ valueBoolean: true });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fahrenheit'), { target: { value: '100' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    const response2 = onSubmit.mock.calls[1][0];
    const answers2 = getQuestionnaireAnswers(response2);

    expect(answers2['q1']).toMatchObject({ valueString: '100' });
    expect(answers2['q2']).toMatchObject({ valueBoolean: false });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fahrenheit'), { target: { value: '' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    const response3 = onSubmit.mock.calls[2][0];
    const answers3 = getQuestionnaireAnswers(response3);

    expect(answers3['q1']).toMatchObject({ valueString: undefined });
    expect(answers3['q2']).toMatchObject({ valueBoolean: false });
  });

  test('Questionnaire CalculatedExpression failed to evaluate expression', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'temperature-threshold',
        title: 'Temperature Threshold Check',
        item: [
          {
            id: 'id-1',
            linkId: 'q1',
            type: 'string',
            text: 'Fahrenheit',
          },
          {
            id: 'id-2',
            linkId: 'q2',
            type: 'boolean',
            text: 'Is temperature over 120?',
            extension: [
              {
                url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                valueExpression: {
                  language: 'text/fhirpath',
                  expression: '%fail',
                },
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fahrenheit'), { target: { value: '125' } });
    });

    expect(
      screen.getByText('Expression evaluation failed: FhirPathError on "%fail": Error: Undefined variable %fail')
    ).toBeInTheDocument();
  });

  test('Questionnaire CalculatedExpression with nested groups', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'temperature-conversion',
        title: 'Temperature Conversion',
        item: [
          {
            id: 'id-6',
            linkId: 'g6',
            type: 'group',
            text: 'Temperature Group',
            item: [
              {
                id: 'id-1',
                linkId: 'q1',
                type: 'decimal',
                text: 'Fahrenheit',
              },
              {
                id: 'id-2',
                linkId: 'q2',
                type: 'decimal',
                text: 'Celsius',
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                    valueExpression: {
                      language: 'text/fhirpath',
                      expression:
                        "iif(%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value.empty(), '', ((%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value - 32) * 5 / 9).round(2))",
                    },
                  },
                ],
              },
              {
                id: 'id-3',
                linkId: 'q3',
                type: 'decimal',
                text: 'Kelvin',
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                    valueExpression: {
                      language: 'text/fhirpath',
                      expression:
                        "iif(%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value.empty(), '', (((%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value - 32) * 5 / 9) + 273.15).round(2))",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Fahrenheit'), { target: { value: '100' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    const answers = getQuestionnaireAnswers(response);

    expect(answers['q1']).toMatchObject({ valueDecimal: 100 }); // Original Fahrenheit value
    expect(answers['q2']).toMatchObject({ valueDecimal: 38 }); // Calculated Celsius
    expect(answers['q3']).toMatchObject({ valueDecimal: 311 }); // Calculated Kelvin
  });

  test('Questionnaire CalculatedExpression with nested groups and QuestionnaireResponse', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        id: 'temperature-conversion',
        title: 'Temperature Conversion',
        item: [
          {
            id: 'id-6',
            linkId: 'g6',
            type: 'group',
            text: 'Temperature Group',
            item: [
              {
                id: 'id-1',
                linkId: 'q1',
                type: 'decimal',
                text: 'Fahrenheit',
              },
              {
                id: 'id-2',
                linkId: 'q2',
                type: 'decimal',
                text: 'Celsius',
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                    valueExpression: {
                      language: 'text/fhirpath',
                      expression:
                        "iif(%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value.empty(), '', ((%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value - 32) * 5 / 9).round(2))",
                    },
                  },
                ],
              },
              {
                id: 'id-3',
                linkId: 'q3',
                type: 'decimal',
                text: 'Kelvin',
                extension: [
                  {
                    url: 'http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire-calculatedExpression',
                    valueExpression: {
                      language: 'text/fhirpath',
                      expression:
                        "iif(%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value.empty(), '', (((%resource.item.where(linkId='g6').item.where(linkId='q1').answer.value - 32) * 5 / 9) + 273.15).round(2))",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      questionnaireResponse: {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [
          {
            id: 'id-76',
            linkId: 'g6',
            text: 'Temperature Group',
            item: [
              {
                id: 'id-77',
                linkId: 'q1',
                text: 'Fahrenheit',
                answer: [
                  {
                    valueDecimal: 100,
                  },
                ],
              },
            ],
            answer: [],
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();

    const response = onSubmit.mock.calls[0][0];
    const answers = getQuestionnaireAnswers(response);

    expect(answers['q1']).toMatchObject({ valueDecimal: 100 }); // Original Fahrenheit value
    expect(answers['q2']).toMatchObject({ valueDecimal: 38 }); // Calculated Celsius
    expect(answers['q3']).toMatchObject({ valueDecimal: 311 }); // Calculated Kelvin
  });

  test('Required radio button choice validation', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'required-radio',
            text: 'Required Radio Choice',
            type: QuestionnaireItemType.choice,
            required: true,
            answerOption: [{ valueString: 'Option 1' }, { valueString: 'Option 2' }, { valueString: 'Option 3' }],
          },
        ],
      },
      onSubmit,
    });

    const radioGroup = screen.getByRole('radiogroup');
    expect(radioGroup).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).not.toHaveBeenCalled();

    const radioOption = screen.getByLabelText('Option 1');
    await act(async () => {
      fireEvent.click(radioOption);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].answer[0].valueString).toBe('Option 1');
  });

  test('Required dropdown choice validation', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'required-dropdown',
            text: 'Required Dropdown Choice',
            type: QuestionnaireItemType.choice,
            required: true,
            answerOption: [{ valueString: 'Option A' }, { valueString: 'Option B' }, { valueString: 'Option C' }],
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'drop-down',
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

    const dropdown = screen.getByLabelText('Required Dropdown Choice *');
    expect(dropdown).toBeInTheDocument();
    expect(dropdown).toHaveAttribute('required');

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.change(dropdown, { target: { value: 'Option A' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].answer[0].valueString).toBe('Option A');
  });

  test('Required value set dropdown validation', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'required-valueset-dropdown',
            text: 'Required Value Set Dropdown',
            type: QuestionnaireItemType.choice,
            required: true,
            answerValueSet: 'http://example.com/valueset',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'drop-down',
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

    const autocomplete = screen.getByRole('searchbox');
    expect(autocomplete).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    await act(async () => {
      fireEvent.change(autocomplete, { target: { value: 'Test' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  test('Required value set radio button validation', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'required-valueset-radio',
            text: 'Required Value Set Radio',
            type: QuestionnaireItemType.choice,
            required: true,
            answerValueSet: 'http://example.com/valueset',
            extension: [
              {
                url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-itemControl',
                valueCodeableConcept: {
                  coding: [
                    {
                      system: 'http://hl7.org/fhir/questionnaire-item-control',
                      code: 'radio-button',
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

    await act(async () => {
      jest.runAllTimers();
    });

    const radioButtons = screen.getAllByRole('radio');
    expect(radioButtons.length).toBeGreaterThan(0);

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(radioButtons[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
  });

  test('Required boolean field validation', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        status: 'active',
        item: [
          {
            linkId: 'required-boolean',
            text: 'Required Boolean Field',
            type: QuestionnaireItemType.boolean,
            required: true,
          },
        ],
      },
      onSubmit,
    });

    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).toHaveAttribute('required');

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(checkbox);
    });

    expect(checkbox).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByText('Submit'));
    });

    expect(onSubmit).toHaveBeenCalled();
    const response = onSubmit.mock.calls[0][0];
    expect(response.item[0].answer[0].valueBoolean).toBe(true);
  });
});
