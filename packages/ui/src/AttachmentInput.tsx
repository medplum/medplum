import { Attachment } from '@medplum/core';
import React from 'react';
import { AttachmentDisplay } from './AttachmentDisplay';
import './AttachmentInput.css';

export interface AttachmentInputProps {
  name: string;
  defaultValue?: Attachment;
}

export function AttachmentInput(props: AttachmentInputProps) {
  const value = props.defaultValue;
  return (
    <div className="medplum-attachment-input" data-testid="attachment-input">
      {value && (
        <AttachmentDisplay value={value} />
      )}
    </div>
  );
}
