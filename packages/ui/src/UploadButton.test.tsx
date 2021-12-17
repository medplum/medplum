import { Attachment } from '@medplum/fhirtypes';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MedplumProvider } from './MedplumProvider';
import { MockClient } from './MockClient';
import { UploadButton, UploadButtonProps } from './UploadButton';

const medplum = new MockClient({});

describe('UploadButton', () => {

  const setup = (args?: UploadButtonProps) => {
    return render(
      <MedplumProvider medplum={medplum}>
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
