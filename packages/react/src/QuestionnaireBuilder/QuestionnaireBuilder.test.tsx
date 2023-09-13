import { MockClient } from '@medplum/mock';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { QuestionnaireItemType } from '../utils/questionnaire';
import { QuestionnaireBuilder, QuestionnaireBuilderProps } from './QuestionnaireBuilder';

const medplum = new MockClient();

async function setup(args: QuestionnaireBuilderProps): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <QuestionnaireBuilder {...args} />
      </MedplumProvider>
    );
  });
}

describe('QuestionnaireBuilder', () => {
  test('Renders empty', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
      },
      onSubmit: jest.fn(),
    });
    expect(screen.getByTestId('questionnaire-form')).toBeDefined();
  });

  test('Render groups', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
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
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByTestId('questionnaire-form')).toBeDefined();
    expect(screen.getByText('Group 1')).toBeDefined();
    expect(screen.getByText('Group 2')).toBeDefined();
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
            text: 'q1',
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
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Sets ids', async () => {
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

    expect(screen.getByText('Save')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    const result = onSubmit.mock.calls[0][0];
    expect(result.item[0].id).toBeDefined();
    expect(result.item[0].answerOption[0].id).toBeDefined();
    expect(result.item[0].answerOption[1].id).toBeDefined();
  });

  test('Edit a question text', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    expect(screen.getByText('Question 1')).toBeDefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Question 1'), {
        target: { value: 'Renamed' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          linkId: 'question1',
          text: 'Renamed',
          type: 'string',
        },
      ],
    });
  });

  test('Add item', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add item'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          linkId: 'question1',
          text: 'Question 1',
          type: 'string',
        },
        {
          text: 'Question',
          type: 'string',
        },
      ],
    });
  });

  test('Add item with existing linkId', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            id: 'id-100',
            linkId: 'q100',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add item'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          id: 'id-100',
          linkId: 'q100',
          text: 'Question 1',
          type: 'string',
        },
        {
          id: 'id-101',
          linkId: 'q101',
          text: 'Question',
          type: 'string',
        },
      ],
    });
  });

  test('Remove item', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
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
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.click(screen.getAllByText('Remove')[0]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          linkId: 'question2',
          text: 'Question 2',
          type: 'string',
        },
      ],
    });
  });

  test('Add group', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add group'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          linkId: 'question1',
          text: 'Question 1',
          type: 'string',
        },
        {
          type: 'group',
        },
      ],
    });
  });

  test('Change title', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('My questionnaire'), {
        target: { value: 'Renamed' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      title: 'Renamed',
    });
  });

  test('Add Reference Profiles', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My References',
        item: [
          {
            linkId: 'reference1',
            text: 'Reference 1',
            type: 'reference',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reference 1'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add Resource'));
    });
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue(''), {
        target: { value: 'Patient' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Add Resource'));
    });
    await act(async () => {
      fireEvent.change(screen.getByDisplayValue(''), {
        target: { value: 'Organization' },
      });
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Patient'), {
        target: { value: 'Practicitioner' },
      });
    });
    expect(screen.getByDisplayValue('Organization')).toBeDefined();
    expect(screen.getByDisplayValue('Practicitioner')).toBeDefined();
    const removeLinks = screen.getAllByText('Remove');
    expect(removeLinks.length).toEqual(3);
    await act(async () => {
      fireEvent.click(removeLinks[0]);
    });
  });

  test('Change linkId', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('question1'), {
        target: { value: 'myNewLinkId' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          linkId: 'myNewLinkId',
        },
      ],
    });
  });

  test('Hover on/off', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            id: 'question1',
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    expect(screen.getByTestId('question1')).not.toHaveClass('hovering');

    await act(async () => {
      fireEvent.mouseOver(screen.getByText('Question 1'));
    });

    expect(screen.getByTestId('question1')).toHaveStyle('border: 1.5px solid #339af0;');

    await act(async () => {
      fireEvent.mouseOver(document.body);
    });

    expect(screen.getByTestId('question1')).not.toHaveClass('hovering');
  });

  test('Add multiple choice', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [],
      },
      onSubmit,
    });

    // Add a new question
    await act(async () => {
      fireEvent.click(screen.getByText('Add item'));
    });

    // Click on the question to start editing
    await act(async () => {
      fireEvent.click(screen.getByText('Question'));
    });

    // Change the question type from "string" (default) to "choice"
    fireEvent.change(screen.getByDisplayValue('String'), {
      target: { value: 'choice' },
    });

    // Add a new choice
    await act(async () => {
      fireEvent.click(screen.getByText('Add choice'));
    });

    // Change the question type from "integer" (default) to "string"
    fireEvent.change(screen.getByDisplayValue('integer'), {
      target: { value: 'string' },
    });

    // Change the text for the choice
    fireEvent.change(screen.getByTestId('value[x]'), {
      target: { value: 'foo bar' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          text: 'Question',
          type: 'choice',
          answerOption: [
            {
              valueString: 'foo bar',
            },
          ],
        },
      ],
    });
  });

  test('Add Pages', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [],
      },
      onSubmit,
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add Page'));
    });

    expect(screen.getByText('New Page')).toBeDefined();
  });

  test('Add Repeatable', async () => {
    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            id: 'question1',
            linkId: 'question1',
            text: 'Question 1',
            type: 'string',
          },
        ],
      },
      onSubmit: jest.fn(),
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Make Repeatable'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Remove Repeatable'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Make Repeatable'));
    });
  });

  test('Add Value Set', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [],
      },
      onSubmit,
    });

    // Add a new question
    await act(async () => {
      fireEvent.click(screen.getByText('Add item'));
    });

    // Click on the question to start editing
    await act(async () => {
      fireEvent.click(screen.getByText('Question'));
    });

    // Change the question type from "string" (default) to "choice"
    fireEvent.change(screen.getByDisplayValue('String'), {
      target: { value: 'choice' },
    });

    // Add a new choice
    await act(async () => {
      fireEvent.click(screen.getByText('Add choice'));
    });

    // Change the question type from "integer" (default) to "string"
    fireEvent.change(screen.getByDisplayValue('integer'), {
      target: { value: 'string' },
    });

    // Change the text for the choice
    fireEvent.change(screen.getByTestId('value[x]'), {
      target: { value: 'foo bar' },
    });

    // Add a value set
    await act(async () => {
      fireEvent.click(screen.getByText('Add value set'));
    });

    // Change the value set
    fireEvent.change(screen.getByDisplayValue(''), {
      target: { value: 'http://example.com' },
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          text: 'Question',
          type: 'choice',
          answerOption: [],
          answerValueSet: 'http://example.com',
        },
      ],
    });
  });

  test('Remove multiple choice', async () => {
    const onSubmit = jest.fn();

    await setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.choice,
            text: 'My question',
            answerOption: [
              {
                valueString: 'Answer 1',
              },
              {
                valueString: 'Answer 2',
              },
              {
                valueString: 'Answer 3',
              },
            ],
          },
        ],
      },
      onSubmit,
    });

    // Click on the question to start editing
    await act(async () => {
      fireEvent.click(screen.getByText('My question'));
    });

    // Get all of the "Remove" links
    const removeLinks = screen.getAllByText('Remove');
    expect(removeLinks.length).toEqual(4); // 1 question + 3 options

    // Remove "Answer 2", which is the 2nd remove link
    await act(async () => {
      fireEvent.click(removeLinks[1]);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [
        {
          text: 'My question',
          type: 'choice',
          answerOption: [
            {
              valueString: 'Answer 1',
            },
            {
              valueString: 'Answer 3',
            },
          ],
        },
      ],
    });
  });
});
