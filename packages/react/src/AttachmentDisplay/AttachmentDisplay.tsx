import { Anchor } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import React from 'react';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element | null {
  const { contentType, url, title } = props.value ?? {};

  if (!url) {
    return null;
  }

  return (
    <div data-testid="attachment-display">
      {contentType?.startsWith('image/') && (
        <img data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={url} alt={title} />
      )}
      {contentType?.startsWith('video/') && (
        <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
          <source type={contentType} src={url} />
        </video>
      )}
      {contentType === 'application/pdf' && (
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
        <Anchor
          href={url}
          data-testid="attachment-details"
          target="_blank"
          rel="noopener noreferrer"
          download={getDownloadName(title)}
        >
          {title || 'Download'}
        </Anchor>
      </div>
    </div>
  );
}

function getDownloadName(title: string | undefined): string | undefined {
  // Title often contains the filename by convention
  return title?.includes('.') ? title : undefined;
}
