import { Attachment } from '@medplum/fhirtypes';
import React from 'react';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element {
  const value = props.value;
  const { contentType, url } = value ?? {};

  return (
    <div data-testid="attachment-display">
      {contentType?.startsWith('image/') && (
        <img data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={url} alt={value?.title} />
      )}
      {contentType?.startsWith('video/') && (
        <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
          <source type={contentType} src={url} />
        </video>
      )}
      <div data-testid="download-link" style={{ padding: '2px 16px 16px 16px' }}>
        <a href={value?.url} data-testid="attachment-details" target="_blank" rel="noopener noreferrer">
          {value?.title || 'Download'}
        </a>
      </div>
    </div>
  );
}
