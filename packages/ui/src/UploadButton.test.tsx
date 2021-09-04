import { Attachment, MedplumClient } from '@medplum/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { UploadButton, UploadButtonProps } from './UploadButton';

const mockRouter = {
  push: (path: string, state: any) => {
    console.log('Navigate to: ' + path + ' (state=' + JSON.stringify(state) + ')');
  },
  listen: () => (() => undefined) // Return mock "unlisten" handler
}

function mockFetch(url: string, options: any): Promise<any> {
  const response: any = {
    request: {
      url,
      options
    }
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

describe('UploadButton', () => {

  beforeAll(async () => {
    await medplum.signIn('admin@medplum.com', 'admin', 'practitioner', 'openid');
  });

  const setup = (args?: UploadButtonProps) => {
    return render(
      <MedplumProvider medplum={medplum} router={mockRouter}>
        <UploadButton onUpload={attachment => console.log('upload', attachment)} {...args} />
      </MedplumProvider>
    );
  };

  test('Null files', async () => {
    const results: Attachment[] = [];

    setup({
      onUpload: (attachment: Attachment) => {
        results.push(attachment);
      }
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: {} });
    });

    expect(results.length).toEqual(0);
  });

  test('Null file element', async () => {
    const results: Attachment[] = [];

    setup({
      onUpload: (attachment: Attachment) => {
        results.push(attachment);
      }
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files: [null] } });
    });

    expect(results.length).toEqual(0);
  });

  test('File without filename', async () => {
    const results: Attachment[] = [];

    setup({
      onUpload: (attachment: Attachment) => {
        results.push(attachment);
      }
    });

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files: [{}] } });
    });

    expect(results.length).toEqual(0);
  });

  test('Upload media', async () => {
    const results: Attachment[] = [];

    setup({
      onUpload: (attachment: Attachment) => {
        results.push(attachment);
      }
    });

    await act(async () => {
      const files = [
        new File(['hello'], 'hello.txt', { type: 'text/plain' })
      ];
      fireEvent.change(screen.getByTestId('upload-file-input'), { target: { files } });
    });

    expect(results.length).toEqual(1);
  });

  test('Click button', async () => {
    const results: Attachment[] = [];

    setup({
      onUpload: (attachment: Attachment) => {
        results.push(attachment);
      }
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('upload-button'));
    });

  });

});
