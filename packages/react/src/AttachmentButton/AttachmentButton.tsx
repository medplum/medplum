import { normalizeOperationOutcome } from '@medplum/core';
import { Attachment, Binary, OperationOutcome } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ChangeEvent, MouseEvent, ReactNode, useRef } from 'react';
import { killEvent } from '../utils/dom';

export interface AttachmentButtonProps {
  onUpload: (attachment: Attachment) => void;
  onUploadStart?: () => void;
  onUploadProgress?: (e: ProgressEvent) => void;
  onUploadError?: (outcome: OperationOutcome) => void;
  children(props: { onClick(e: MouseEvent): void }): ReactNode;
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

    if (props.onUploadStart) {
      props.onUploadStart();
    }

    const filename = file.name;
    const contentType = file.type || 'application/octet-stream';
    medplum
      .createBinary(file, filename, contentType, props.onUploadProgress)
      .then((binary: Binary) => {
        props.onUpload({
          contentType: binary.contentType,
          url: binary.url,
          title: filename,
        });
      })
      .catch((err) => {
        if (props.onUploadError) {
          props.onUploadError(normalizeOperationOutcome(err));
        }
      });
  }

  return (
    <>
      <input
        type="file"
        data-testid="upload-file-input"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={(e) => onFileChange(e)}
      />
      {props.children({ onClick })}
    </>
  );
}
