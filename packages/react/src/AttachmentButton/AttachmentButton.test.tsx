// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { Attachment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AttachmentButton } from './AttachmentButton';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
}));

const medplum = new MockClient();

describe('AttachmentButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  test('Error handling shows notification', async () => {
    const errorFn = vi.fn();

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

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Upload error',
        color: 'red',
      })
    );
  });

  test('Custom text', async () => {
    setup(
      <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My button</Button>}</AttachmentButton>
    );

    expect(screen.getByText('My button')).toBeInTheDocument();
  });

  test('Calls onUploadStart callback', async () => {
    const startFn = vi.fn();

    setup(
      <AttachmentButton onUpload={console.log} onUploadStart={startFn}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(startFn).toHaveBeenCalled();
  });

  test('Passes uploading and progress state inline', async () => {
    let resolveUpload: (attachment: Attachment) => void = () => {};
    const pendingPromise = new Promise<Attachment>((resolve) => {
      resolveUpload = resolve;
    });

    vi.spyOn(medplum, 'createAttachment').mockReturnValue(pendingPromise);

    setup(
      <AttachmentButton onUpload={console.log}>
        {(props) => (
          <button onClick={props.onClick} disabled={props.disabled}>
            {props.uploading ? `Uploading ${props.progress}%` : 'Upload'}
          </button>
        )}
      </AttachmentButton>
    );

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(screen.getByText('Uploading 0%')).toBeInTheDocument();

    const options = vi.mocked(medplum.createAttachment).mock.calls[0][0] as { onProgress?: (e: ProgressEvent) => void };

    await act(async () => {
      options.onProgress?.({
        lengthComputable: true,
        loaded: 50,
        total: 100,
      } as ProgressEvent);
    });

    expect(screen.getByText('Uploading 50%')).toBeInTheDocument();

    await act(async () => {
      resolveUpload({ resourceType: 'Attachment', id: '123' });
    });
  });

  test('Aggregates progress for concurrent uploads properly', async () => {
    const pendingPromises: ((attachment: Attachment) => void)[] = [];

    vi.spyOn(medplum, 'createAttachment').mockImplementation(
      () =>
        new Promise<Attachment>((resolve) => {
          pendingPromises.push(resolve);
        })
    );

    setup(
      <AttachmentButton onUpload={vi.fn()}>
        {(props) => (
          <button onClick={props.onClick}>{props.uploading ? `Uploading ${props.progress}%` : 'Upload'}</button>
        )}
      </AttachmentButton>
    );

    await act(async () => {
      const file1 = new File(['a'.repeat(100)], '1.txt', { type: 'text/plain' });
      const file2 = new File(['b'.repeat(300)], '2.txt', { type: 'text/plain' });

      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files: [file1, file2] },
      });
    });

    const calls = vi.mocked(medplum.createAttachment).mock.calls;
    const firstOptions = calls[0][0] as { onProgress?: (e: ProgressEvent) => void };
    const secondOptions = calls[1][0] as { onProgress?: (e: ProgressEvent) => void };

    await act(async () => {
      firstOptions.onProgress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
      secondOptions.onProgress?.({ lengthComputable: true, loaded: 150, total: 300 } as ProgressEvent);
    });

    expect(screen.getByText('Uploading 50%')).toBeInTheDocument();

    await act(async () => {
      pendingPromises.forEach((resolve) => resolve({ resourceType: 'Attachment', id: '123' }));
    });
  });

  test('Resets uploading state after upload completes', async () => {
    let resolveUpload: (attachment: Attachment) => void = () => {};
    const pendingPromise = new Promise<Attachment>((resolve) => {
      resolveUpload = resolve;
    });

    vi.spyOn(medplum, 'createAttachment').mockReturnValue(pendingPromise);

    setup(
      <AttachmentButton onUpload={vi.fn()}>
        {(props) => <button>{props.uploading ? `Uploading ${props.progress}%` : 'Upload'}</button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: {
          files: [new File(['hello'], 'hello.txt', { type: 'text/plain' })],
        },
      });
    });

    expect(screen.getByText('Uploading 0%')).toBeInTheDocument();

    await act(async () => {
      resolveUpload({ resourceType: 'Attachment', id: '123' });
    });

    expect(screen.getByText('Upload')).toBeInTheDocument();
  });
});
