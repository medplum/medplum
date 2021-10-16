import { MedplumClient } from '@medplum/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { AttachmentDisplay, AttachmentDisplayProps } from './AttachmentDisplay';
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

const setup = (args?: AttachmentDisplayProps) => {
  return render(
    <MedplumProvider medplum={medplum} router={mockRouter}>
      <AttachmentDisplay {...args} />
    </MedplumProvider>
  );
};

describe('AttachmentDisplay', () => {

  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
  });

  test('Renders empty', () => {
    setup();
  });

  test('Renders image', async () => {
    await act(async () => {
      await setup({
        value: {
          contentType: 'image/jpeg',
          url: 'https://example.com/test.jpg'
        }
      });
      await waitFor(() => screen.getByTestId('attachment-image'));
    });
  });

  test('Renders video', async () => {
    await act(async () => {
      await setup({
        value: {
          contentType: 'video/mp4',
          url: 'https://example.com/test.mp4'
        }
      });
      await waitFor(() => screen.getByTestId('attachment-video'));
    });
  });

  test('Renders other file', async () => {
    await act(async () => {
      await setup({
        value: {
          contentType: 'text/plain',
          url: 'https://example.com/test.txt'
        }
      });
      await waitFor(() => screen.getByTestId('attachment-details'));
    });
  });

})
