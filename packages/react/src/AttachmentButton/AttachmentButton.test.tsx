// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { showNotification, updateNotification } from '@mantine/notifications';
import type { Attachment } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AttachmentButton } from './AttachmentButton';

vi.mock('@mantine/notifications', () => ({
  showNotification: vi.fn(),
  updateNotification: vi.fn(),
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

  test('Error handling', async () => {
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
  });

  test('Custom text', async () => {
    setup(
      <AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>My button</Button>}</AttachmentButton>
    );

    expect(screen.getByText('My button')).toBeInTheDocument();
  });

  test('Clears file input after file selection', async () => {
    setup(<AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>Upload</Button>}</AttachmentButton>);

    const input = screen.getByTestId('upload-file-input') as HTMLInputElement;
    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];
      fireEvent.change(input, {
        target: { files },
      });
    });

    expect(input.value).toBe('');
  });

  test('Shows notifications on successful upload', async () => {
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

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Initializing upload...',
        loading: true,
      })
    );

    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Upload complete',
        color: 'teal',
      })
    );
  });

  test('Shows error notification on upload failure', async () => {
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

    expect(showNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Initializing upload...',
      })
    );

    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Upload error',
        color: 'red',
      })
    );
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

  test('Uses separate notifications for concurrent uploads', async () => {
    const createAttachment = vi.spyOn(medplum, 'createAttachment');

    setup(<AttachmentButton onUpload={vi.fn()}>{(props) => <Button {...props}>Upload</Button>}</AttachmentButton>);

    await act(async () => {
      const files = [
        new File(['hello'], 'hello.txt', { type: 'text/plain' }),
        new File(['world'], 'world.txt', { type: 'text/plain' }),
      ];

      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    expect(showNotification).toHaveBeenCalledTimes(2);

    const firstNotification = vi.mocked(showNotification).mock.calls[0][0];
    const secondNotification = vi.mocked(showNotification).mock.calls[1][0];

    expect(firstNotification.id).toBeDefined();
    expect(secondNotification.id).toBeDefined();
    expect(firstNotification.id).not.toBe(secondNotification.id);

    const firstOptions = createAttachment.mock.calls[0][0] as {
      onProgress?: (e: ProgressEvent) => void;
    };
    const secondOptions = createAttachment.mock.calls[1][0] as {
      onProgress?: (e: ProgressEvent) => void;
    };

    firstOptions.onProgress?.({
      lengthComputable: true,
      loaded: 25,
      total: 100,
    } as ProgressEvent);

    secondOptions.onProgress?.({
      lengthComputable: true,
      loaded: 75,
      total: 100,
    } as ProgressEvent);

    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: firstNotification.id,
        title: 'Uploading...',
      })
    );

    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        id: secondNotification.id,
        title: 'Uploading...',
      })
    );
  });

  test('Updates notification with upload progress', async () => {
    const createAttachment = vi.spyOn(medplum, 'createAttachment');

    setup(<AttachmentButton onUpload={console.log}>{(props) => <Button {...props}>Upload</Button>}</AttachmentButton>);

    await act(async () => {
      const files = [new File(['hello'], 'hello.txt', { type: 'text/plain' })];

      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: { files },
      });
    });

    const options = createAttachment.mock.calls[0][0] as { onProgress?: (e: ProgressEvent) => void };

    options.onProgress?.({
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent);

    expect(updateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Uploading...',
        message: 'Uploaded: 50.00  B / 100.00  B 50.00%',
        loading: true,
      })
    );
  });

  test('Calls onUploadProgress callback', async () => {
    const progressFn = vi.fn();
    const createAttachment = vi.spyOn(medplum, 'createAttachment');

    setup(
      <AttachmentButton onUpload={vi.fn()} onUploadProgress={progressFn}>
        {(props) => <Button {...props}>Upload</Button>}
      </AttachmentButton>
    );

    await act(async () => {
      fireEvent.change(screen.getByTestId('upload-file-input'), {
        target: {
          files: [new File(['hello'], 'hello.txt', { type: 'text/plain' })],
        },
      });
    });

    const options = createAttachment.mock.calls[0][0] as {
      onProgress?: (e: ProgressEvent) => void;
    };

    const progress = {
      lengthComputable: true,
      loaded: 50,
      total: 100,
    } as ProgressEvent;

    options.onProgress?.(progress);

    expect(progressFn).toHaveBeenCalledWith(progress);
  });
});
