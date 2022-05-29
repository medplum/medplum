import { Attachment, Binary, OperationOutcome } from '@medplum/fhirtypes';
import React, { useRef } from 'react';
import { Button } from './Button';
import { useMedplum } from './MedplumProvider';
import { killEvent } from './utils/dom';

export interface UploadButtonProps {
  onUpload: (attachment: Attachment) => void;
}

export function UploadButton(props: UploadButtonProps): JSX.Element {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    const filename = file.name;
    const contentType = file.type || 'application/octet-stream';
    medplum
      .createBinary(file, filename, contentType)
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
      <Button
        testid="upload-button"
        onClick={(e) => {
          killEvent(e);
          fileInputRef.current?.click();
        }}
      >
        Upload...
      </Button>
    </>
  );
}
