import { Attachment } from '@medplum/core';
import React from 'react';

export interface AttachmentInputProps {
  name: string;
  defaultValue?: Attachment;
}

export function AttachmentInput(props: AttachmentInputProps) {
  const value = props.defaultValue;
  const { contentType, url } = value ?? {};

  return (
    <div data-testid="attachment-input">
      <div>{value?.contentType}</div>
      <div>{value?.url}</div>
      {contentType?.startsWith('image/') && url && (
        <img style={{ maxWidth: 100 }} src={url} />
      )}
    </div>
  );
}
