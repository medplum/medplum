import { Attachment } from '@medplum/fhirtypes';
import React from 'react';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element {
  const value = props.value;
  const { contentType, url } = value ?? {};

  if (contentType && url) {
    if (contentType.startsWith('image/')) {
      return <img data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={url} alt={value?.title} />;
    }

    if (contentType.startsWith('video/')) {
      return (
        <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
          <source type={contentType} src={url} />
        </video>
      );
    }

    if (contentType === 'application/pdf') {
      return (
        <div data-testid="attachment-pdf" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
          <iframe width="100%" height="400" src={url} allowFullScreen={true} frameBorder={0} seamless={true} />
        </div>
      );
    }
  }

  return (
    <a href={value?.url} data-testid="attachment-details" target="_blank" rel="noopener noreferrer">
      {value?.title}
    </a>
  );
}
