import { Binary, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { randomUUID } from 'crypto';
import React from 'react';
import { AttachmentInput, AttachmentInputProps } from './AttachmentInput';
import { MedplumProvider } from './MedplumProvider';

function mockFetch(url: string, options: any): Promise<any> {
  let result: any = {};

  if (options.method === 'POST' && url === 'https://example.com/fhir/R4/Binary') {
    const binary: Binary = {
      resourceType: 'Binary',
      id: randomUUID(),
      contentType: 'text/plain',
    };
    result = binary;
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

const setup = (args?: AttachmentInputProps) => {
  return render(
    <MedplumProvider medplum={medplum}>
      <AttachmentInput name="test" {...args} />
    </MedplumProvider>
  );
};

describe('AttachmentInput', () => {

  beforeAll(async () => {
    global.URL.createObjectURL = jest.fn(() => 'details');
  });

  test('Renders', () => {
    setup();
  });

  test('Renders attachments', async () => {
    await act(async () => {
      await setup({
        name: 'test',
        defaultValue: {
          contentType: 'image/jpeg',
          url: 'https://example.com/test.jpg',
          title: 'test.jpg'
        }
      });
      await waitFor(() => screen.getByAltText('test.jpg'));
    });
  });

  test('Add attachment', async () => {
    setup();

    await act(async () => {
      const files = [
        new File(['hello'], 'hello.txt', { type: 'text/plain' })
      ];
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files } });
    });

    expect(screen.getByText('hello.txt')).toBeInTheDocument();
  });

  test('Remove attachment', async () => {
    await act(async () => {
      await setup({
        name: 'test',
        defaultValue: {
          contentType: 'image/jpeg',
          url: 'https://example.com/test.jpg',
          title: 'test.jpg'
        }
      });
    });

    await act(async () => {
      await waitFor(() => screen.getByAltText('test.jpg'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Remove'));
    });

    expect(screen.queryByText('image/jpeg')).toBeNull();
  });

  test('Calls onChange', async () => {
    const onChange = jest.fn();

    setup({
      name: 'test',
      onChange
    });

    await act(async () => {
      const files = [
        new File(['hello'], 'hello.txt', { type: 'text/plain' })
      ];
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files } });
    });

    expect(onChange).toHaveBeenCalled();
  });

});
