// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';
import { generateId, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { Attachment, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { IconFileAlert } from '@tabler/icons-react';
import type { ChangeEvent, JSX, MouseEvent, ReactNode } from 'react';
import { useRef, useState } from 'react';
import { killEvent } from '../utils/dom';

export interface AttachmentButtonProps {
  readonly securityContext?: Reference;
  readonly onUpload: (attachment: Attachment) => void;
  readonly onUploadStart?: () => void;
  readonly onUploadProgress?: (e: ProgressEvent) => void;
  readonly onUploadError?: (outcome: OperationOutcome) => void;
  children(props: {
    disabled?: boolean;
    onClick(e: MouseEvent): void;
    uploading: boolean;
    progress: number;
  }): ReactNode;
  readonly disabled?: boolean;
}

type UploadProgress = {
  loaded: number;
  total: number;
};

export function AttachmentButton(props: AttachmentButtonProps): JSX.Element {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});

  const uploadValues = Object.values(uploadProgress);
  const uploading = uploadValues.length > 0;

  const totalLoaded = uploadValues.reduce((sum, upload) => sum + upload.loaded, 0);
  const totalBytes = uploadValues.reduce((sum, upload) => sum + upload.total, 0);
  const progress = uploading && totalBytes > 0 ? (totalLoaded / totalBytes) * 100 : 0;

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

    const uploadId = generateId();

    setUploadProgress((prev) => ({
      ...prev,
      [uploadId]: { loaded: 0, total: file.size },
    }));

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
          if (e.lengthComputable) {
            setUploadProgress((prev) => ({
              ...prev,
              [uploadId]: { loaded: e.loaded, total: e.total },
            }));
          }

          if (props.onUploadProgress) {
            props.onUploadProgress(e);
          }
        },
      })
      .then((attachment: Attachment) => {
        props.onUpload(attachment);
      })
      .catch((err) => {
        const outcome = normalizeOperationOutcome(err);

        showNotification({
          color: 'red',
          title: 'Upload error',
          message: normalizeErrorString(outcome),
          icon: <IconFileAlert size={16} />,
          autoClose: 2000,
        });

        if (props.onUploadError) {
          props.onUploadError(outcome);
        }
      })
      .finally(() => {
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
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
      {props.children({ onClick, disabled: props.disabled, uploading, progress })}
    </>
  );
}
