import { MedplumClient } from '@medplum/core';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { act } from 'react-dom/test-utils';
import { QuestionnaireItemType } from '.';
import { MedplumProvider } from './MedplumProvider';
import { QuestionnaireBuilder, QuestionnaireBuilderProps } from './QuestionnaireBuilder';

function mockFetch(url: string, options: any): Promise<any> {
  let result: any;

  if (url.endsWith('/auth/login')) {
    result = {
      user: {
        resourceType: 'User',
        id: '123'
      },
      profile: {
        resourceType: 'Practitioner',
        id: '456'
      }
    };
  }

  const response: any = {
    request: {
      url,
      options
    },
    ...result
  };

  return Promise.resolve({
    blob: () => Promise.resolve(response),
    json: () => Promise.resolve(response)
  });
}

const medplum = new MedplumClient({
  baseUrl: 'https://example.com/',
  clientId: 'my-client-id',
  fetch: mockFetch
});

const setup = (args: QuestionnaireBuilderProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <QuestionnaireBuilder {...args} />
    </MedplumProvider>
  );
};

describe('QuestionnaireBuilder', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  test('Renders empty', () => {
    setup({
      questionnaire: {
        resourceType: 'Questionnaire'
      },
      onSubmit: jest.fn()
    });
    expect(screen.getByTestId('questionnaire-form')).not.toBeUndefined();
  });

  test('Render groups', async () => {
    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [{
          linkId: 'group1',
          text: 'Group 1',
          type: 'group',
          item: [{
            linkId: 'question1',
            text: 'Question 1',
            type: 'string'
          },
          {
            linkId: 'question2',
            text: 'Question 2',
            type: 'string'
          }]
        }, {
          linkId: 'group2',
          text: 'Group 2',
          type: 'group',
          item: [{
            linkId: 'question3',
            text: 'Question 3',
            type: 'string'
          },
          {
            linkId: 'question4',
            text: 'Question 4',
            type: 'string'
          }]
        }]
      },
      onSubmit: jest.fn()
    });

    expect(screen.getByTestId('questionnaire-form')).not.toBeUndefined();
    expect(screen.getByText('Group 1')).not.toBeUndefined();
    expect(screen.getByText('Group 2')).not.toBeUndefined();
  });

  test('Handles submit', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: QuestionnaireItemType.string,
            text: 'q1'
          },
          {
            linkId: 'q2',
            type: QuestionnaireItemType.integer,
            text: 'q1'
          },
          {
            linkId: 'q3',
            type: QuestionnaireItemType.date,
            text: 'q3'
          },
          {
            linkId: '', // Silently ignore missing linkId
            type: QuestionnaireItemType.string,
            text: 'q4'
          },
          {
            linkId: 'q5',
            type: '', // Silently ignore missing type
            text: 'q5'
          }
        ]
      },
      onSubmit
    });

    expect(screen.getByText('OK')).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

  test('Edit a question text', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [{
          linkId: 'question1',
          text: 'Question 1',
          type: 'string'
        }]
      },
      onSubmit
    });

    expect(screen.getByText('Question 1')).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('Question 1'), { target: { value: 'Renamed' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'question1',
        text: 'Renamed',
        type: 'string'
      }]
    });

  });

  test('Add item', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [{
          linkId: 'question1',
          text: 'Question 1',
          type: 'string'
        }]
      },
      onSubmit
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add item'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'question1',
        text: 'Question 1',
        type: 'string'
      }, {
        text: 'Question',
        type: 'string'
      }]
    });

  });

  test('Remove item', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [{
          linkId: 'question1',
          text: 'Question 1',
          type: 'string'
        }, {
          linkId: 'question2',
          text: 'Question 2',
          type: 'string'
        }]
      },
      onSubmit
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Question 1'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'question2',
        text: 'Question 2',
        type: 'string'
      }]
    });

  });

  test('Add group', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [{
          linkId: 'question1',
          text: 'Question 1',
          type: 'string'
        }]
      },
      onSubmit
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Add group'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      item: [{
        linkId: 'question1',
        text: 'Question 1',
        type: 'string'
      }, {
        type: 'group'
      }]
    });

  });

  test('Change title', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        title: 'My questionnaire',
        item: [{
          linkId: 'question1',
          text: 'Question 1',
          type: 'string'
        }]
      },
      onSubmit
    });

    await act(async () => {
      fireEvent.click(screen.getByText('My questionnaire'));
    });

    await act(async () => {
      fireEvent.change(screen.getByDisplayValue('My questionnaire'), { target: { value: 'Renamed' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      resourceType: 'Questionnaire',
      title: 'Renamed',
      item: [{
        linkId: 'question1',
        text: 'Question 1',
        type: 'string'
      }]
    });

  });

});
