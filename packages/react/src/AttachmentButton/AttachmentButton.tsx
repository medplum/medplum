import { normalizeOperationOutcome } from '@medplum/core';
import { Attachment, OperationOutcome, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import { ChangeEvent, MouseEvent, ReactNode, useRef } from 'react';
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

    medplum
      .createAttachment({
        data: file,
        contentType: file.type || 'application/octet-stream',
        filename: file.name,
        securityContext: props.securityContext,
        onProgress: props.onUploadProgress,
      })
      .then((attachment: Attachment) => props.onUpload(attachment))
      .catch((err) => {
        if (props.onUploadError) {
          props.onUploadError(normalizeOperationOutcome(err));
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
      {props.children({ onClick, disabled: props.disabled })}
    </>
  );
}
