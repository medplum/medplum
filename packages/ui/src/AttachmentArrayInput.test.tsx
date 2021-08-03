import { MedplumClient } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AttachmentArrayInput, AttachmentArrayInputProps } from './AttachmentArrayInput';
import { MedplumProvider } from './MedplumProvider';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const result: any = {};

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

const setup = (args?: AttachmentArrayInputProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <AttachmentArrayInput name="test" {...args} />
    </MedplumProvider>
  );
};

beforeAll(async () => {
  global.URL.createObjectURL = jest.fn(() => 'details');
});

test('AttachmentArrayInput renders', () => {
  setup();
});

test('AttachmentArrayInput renders empty array', () => {
  setup({
    name: 'test',
    values: []
  });
});

test('AttachmentArrayInput renders attachments', async () => {
  await act(async () => {
    await setup({
      name: 'test',
      values: [{
        contentType: 'image/jpeg',
        url: 'https://example.com/test.jpg'
      }]
    });
    await waitFor(() => screen.getByTestId('attachment-input'));
  });
});
