import { Attachment, Binary, OperationOutcome } from '@medplum/fhirtypes';
import React, { useRef } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider';
import { killEvent } from '../utils/dom';

export interface AttachmentButtonProps {
  onUpload: (attachment: Attachment) => void;
  onUploadStart?: () => void;
  onUploadProgress?: (e: ProgressEvent) => void;
  children(props: { onClick(e: React.MouseEvent): void }): React.ReactNode;
}

export function AttachmentButton(props: AttachmentButtonProps): JSX.Element {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onClick(e: React.MouseEvent): void {
    killEvent(e);
    fileInputRef.current?.click();
  }

  function onFileChange(e: React.ChangeEvent): void {
    killEvent(e);
    const files = (e.target as HTMLInputElement).files;
    if (files) {
      Array.from(files).forEach(processFile);
    }
  }

  /**
   * Processes a single file.
   *
   * @param {File} file The file descriptor.
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
      .catch((outcome: OperationOutcome) => {
        alert(outcome?.issue?.[0]?.details?.text);
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
