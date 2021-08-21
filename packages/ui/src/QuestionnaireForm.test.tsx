import { MedplumClient, PropertyType } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { QuestionnaireForm, QuestionnaireFormProps } from './QuestionnaireForm';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

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

const setup = (args: QuestionnaireFormProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <QuestionnaireForm {...args} />
    </MedplumProvider>
  );
};

describe('QuestionnaireForm', () => {

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

  test('Handles submit', async () => {
    const onSubmit = jest.fn();

    setup({
      questionnaire: {
        resourceType: 'Questionnaire',
        item: [
          {
            linkId: 'q1',
            type: PropertyType.string,
            text: 'q1'
          },
          {
            linkId: 'q2',
            type: PropertyType.integer,
            text: 'q1'
          },
          {
            linkId: 'q3',
            type: PropertyType.date,
            text: 'q3'
          },
          {
            linkId: '', // Silently ignore missing linkId
            type: PropertyType.string,
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

    expect(screen.getByTestId('questionnaire-form')).not.toBeUndefined();
    expect(screen.queryByTestId('q4')).toBeFalsy();
    expect(screen.queryByTestId('q5')).toBeFalsy();

    await act(async () => {
      fireEvent.change(screen.getByTestId('q1'), { target: { value: 'a1' } });
      fireEvent.change(screen.getByTestId('q2'), { target: { value: '2' } });
      fireEvent.change(screen.getByTestId('q3'), { target: { value: '2023-03-03' } });
    });

    expect(screen.getByText('OK')).not.toBeUndefined();

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(onSubmit).toBeCalled();
  });

});
