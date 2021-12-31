import { Attachment } from '@medplum/fhirtypes';
import React from 'react';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element {
  const value = props.value;
  const { contentType, url } = value ?? {};

  if (contentType?.startsWith('image/') && url) {
    return <img data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={url} alt={value?.title} />;
  }

  if (contentType?.startsWith('video/') && url) {
    return (
      <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
        <source type={contentType} src={url} />
      </video>
    );
  }

  return (
    <a href={value?.url} data-testid="attachment-details">
      {value?.title}
    </a>
  );
}
