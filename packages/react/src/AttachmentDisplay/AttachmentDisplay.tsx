import { Anchor } from '@mantine/core';
import { Attachment } from '@medplum/fhirtypes';
import { useCachedBinaryUrl } from '@medplum/react-hooks';

export interface AttachmentDisplayProps {
  readonly value?: Attachment;
  readonly maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element | null {
  const { contentType, url: uncachedUrl, title } = props.value ?? {};
  const url = useCachedBinaryUrl(uncachedUrl);

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
      {(contentType?.startsWith('text/') ||
        contentType === 'application/json' ||
        contentType === 'application/pdf') && (
        <div data-testid="attachment-iframe" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
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
          // use the `uncachedUrl` to download the file as the cached URL may expire by the time the user clicks the download link
          href={uncachedUrl}
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
