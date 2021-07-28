import { Attachment, Binary } from '@medplum/core';
import React, { useRef } from 'react';
import { useMedplum } from './MedplumProvider';

export interface UploadButtonProps {
  onUpload: (attachment: Attachment) => void;
}

export function UploadButton(props: UploadButtonProps) {
  const medplum = useMedplum();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent) {
    e.preventDefault();
    e.stopPropagation();
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
  function processFile(file: File) {
    if (!file) {
      return;
    }

    const fileName = file.name;
    if (!fileName) {
      return;
    }

    const contentType = file.type || 'application/octet-stream';
    medplum.createBinary(file, contentType)
      .then((binary: Binary) => {
        props.onUpload({
          contentType: binary.contentType,
          url: medplum.fhirUrl('Binary', binary.id as string),
          title: file.name
        });
      })
      .catch((err: any) => {
        alert(err?.outcome?.issue?.[0]?.details?.text);
      });
  }

  return (
    <>
      <input
        type="file"
        data-testid="upload-file-input"
        style={{ display: 'none' }}
        ref={fileInputRef}
        onChange={e => onFileChange(e)} />
      <button
        data-testid="upload-button"
        className="btn"
        onClick={e => {
          e.preventDefault();
          e.stopPropagation();
          fileInputRef.current?.click();
        }}>Upload...</button>
    </>
  );
}
