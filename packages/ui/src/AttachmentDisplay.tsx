import { Attachment } from '@medplum/fhirtypes';
import React from 'react';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element {
  const value = props.value;
  const { contentType, url, title } = value ?? {};

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
      {contentType === 'application/pdf' && !title?.endsWith('.pdf') && (
        <div data-testid="attachment-pdf" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
          <iframe
            width="100%"
            height="400"
            src={url + '#navpanes=0'}
            allowFullScreen={true}
            frameBorder={0}
            seamless={true}
          />
        </div>
      )}
      <div data-testid="download-link" style={{ padding: '2px 16px 16px 16px' }}>
        <a href={value?.url} data-testid="attachment-details" target="_blank" rel="noopener noreferrer">
          {value?.title || 'Download'}
        </a>
      </div>
    </div>
  );
}
