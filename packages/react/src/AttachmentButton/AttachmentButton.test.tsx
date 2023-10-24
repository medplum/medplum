import { Button } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { AttachmentButton } from './AttachmentButton';

const medplum = new MockClient();

describe('AttachmentButton', () => {
  const setup = (children: React.ReactNode): void => {
    render(<MedplumProvider medplum={medplum}>{children}</MedplumProvider>);
  };

  test('Null files', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), { target: {} });
    });

    expect(results.length).toEqual(0);
  });

  test('Null file element', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), {
        target: { files: [null] },
      });
    });

    expect(results.length).toEqual(0);
  });

  test('File without filename', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByText('Upload'), {
        target: { files: [{}] },
      });
    });

    expect(results.length).toEqual(0);
  });

  test('Upload media', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(results.length).toEqual(1);
  });

  test('Click button', async () => {
    const results: Attachment[] = [];

    setup(
      <AttachmentButton onUpload={(attachment: Attachment) => results.push(attachment)}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Upload'));
    });
  });

  test('Error handling', async () => {
    window.alert = jest.fn();

    setup(<AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>Upload</Button>}</AttachmentButton>);

    await act(async () => {
      const files = [new File(['exe'], 'hello.exe', { type: 'application/exe' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(window.alert).toHaveBeenCalledWith('Invalid file type');
  });

  test('Custom text', async () => {
    setup(
      <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My button</Button>}</AttachmentButton>
    );

    expect(screen.getByText('My button')).toBeInTheDocument();
  });
});
