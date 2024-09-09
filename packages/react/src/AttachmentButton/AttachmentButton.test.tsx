import { Button } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AttachmentButton } from './AttachmentButton';

const medplum = new MockClient();

describe('AttachmentButton', () => {
  const setup = (children: ReactNode): void => {
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
    const errorFn = jest.fn();

    setup(
      <AttachmentButton onUpload={console.log} onUploadError={errorFn}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['exe'], 'hello.exe', { type: 'application/exe' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(errorFn).toHaveBeenCalledWith({
      resourceType: 'OperationOutcome',
      issue: [{ code: 'invalid', details: { text: 'Invalid file type' }, severity: 'error' }],
    });
  });

  test('Custom text', async () => {
    setup(
      <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My button</Button>}</AttachmentButton>
    );

    expect(screen.getByText('My button')).toBeInTheDocument();
  });
});
