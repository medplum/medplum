// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification, updateNotification } from '@mantine/notifications';
import { generateId, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { Attachment, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconCheck, IconFileAlert } from '@tabler/icons-react';
import type { ChangeEvent, JSX, MouseEvent, ReactNode } from 'react';
import { useRef } from 'react';
import { killEvent } from '../utils/dom';

export interface AttachmentButtonProps {
  readonly securityContext?: Reference;
  readonly onUpload: (attachment: Attachment) => void;
  readonly onUploadStart?: () => void;
  readonly onUploadProgress?: (e: ProgressEvent) => void;
  readonly onUploadError?: (outcome: OperationOutcome) => void;
  children(props: { disabled?: boolean; onClick(e: MouseEvent): void }): ReactNode;
  readonly disabled?: boolean;
}

export function AttachmentButton(props: AttachmentButtonProps): JSX.Element {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onClick(e: MouseEvent): void {
    killEvent(e);
    fileInputRef.current?.click();
  }

  function onFileChange(e: ChangeEvent): void {
    killEvent(e);
    const files = (e.target as HTMLInputElement).files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  /**
   * Processes a single file.
   * @param file - The file descriptor.
   */
  function processFile(file: File): void {
    if (!file) {
      return;
    }

    const fileName = file.name;
    if (!fileName) {
      return;
    }

    const notificationId = `upload-${generateId()}`;

    showNotification({
      id: notificationId,
      loading: true,
      title: 'Initializing upload...',
      message: 'Please wait...',
      autoClose: false,
      withCloseButton: false,
    });

    if (props.onUploadStart) {
      props.onUploadStart();
    }

    medplum
      .createAttachment({
        data: file,
        contentType: file.type || 'application/octet-stream',
        filename: file.name,
        securityContext: props.securityContext,
        onProgress: (e: ProgressEvent) => {
          updateNotification({
            id: notificationId,
            loading: true,
            title: 'Uploading...',
            message: getProgressMessage(e),
            autoClose: false,
            withCloseButton: false,
          });

          if (props.onUploadProgress) {
            props.onUploadProgress(e);
          }
        },
      })
      .then((attachment: Attachment) => {
        props.onUpload(attachment);

        updateNotification({
          id: notificationId,
          color: 'teal',
          title: 'Upload complete',
          message: '',
          icon: <IconCheck size={16} />,
          autoClose: 2000,
        });
      })
      .catch((err) => {
        const outcome = normalizeOperationOutcome(err);

        updateNotification({
          id: notificationId,
          color: 'red',
          title: 'Upload error',
          message: normalizeErrorString(outcome),
          icon: <IconFileAlert size={16} />,
          autoClose: 2000,
        });

        if (props.onUploadError) {
          props.onUploadError(outcome);
        }
      });
  }

  return (
    <>
      <input
        disabled={props.disabled}
        type="file"
        data-testid="upload-file-input"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={(e) => onFileChange(e)}
      />
      {/* eslint-disable-next-line react-hooks/refs */}
      {props.children({ onClick, disabled: props.disabled })}
    </>
  );
}

function getProgressMessage(e: ProgressEvent): string {
  if (e.lengthComputable) {
    const percent = (100 * e.loaded) / e.total;
    return `Uploaded: ${formatFileSize(e.loaded)} / ${formatFileSize(e.total)} ${percent.toFixed(2)}%`;
  }
  return `Uploaded: ${formatFileSize(e.loaded)}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0.00 B';
  }
  const e = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, e)).toFixed(2) + ' ' + ' KMGTP'.charAt(e) + 'B';
}
