// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor } from '@mantine/core';
import { ContentType } from '@medplum/core';
import type { Attachment } from '@medplum/fhirtypes';
import { useCachedBinaryUrl } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { CcdaDisplay } from '../CcdaDisplay/CcdaDisplay';
import { ScannedImage } from './ScannedImage';

export interface AttachmentDisplayProps {
  readonly value?: Attachment;
  readonly maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element | null {
  const { contentType, data, url: storedUrl, title } = props.value ?? {};
  const uncachedUrl = toSafeUrl(storedUrl);
  const cachedUrl = useCachedBinaryUrl(uncachedUrl);

  if (!cachedUrl && !data) {
    return null;
  }

  const url = cachedUrl ?? `data:${contentType};base64,${data}`;

  return (
    <div data-testid="attachment-display">
      {contentType?.startsWith('image/') && (
        <ScannedImage data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={url} alt={title} />
      )}
      {contentType?.startsWith('video/') && (
        <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
          <source type={contentType} src={url} />
        </video>
      )}
      {contentType?.startsWith('audio/') && (
        <audio data-testid="attachment-audio" style={{ maxWidth: props.maxWidth }} controls={true}>
          <source type={contentType} src={url} />
        </audio>
      )}
      {(contentType?.startsWith('text/') ||
        contentType === 'application/json' ||
        contentType === 'application/pdf') && (
        <div data-testid="attachment-iframe" style={{ maxWidth: props.maxWidth, minHeight: 400 }}>
          <iframe
            title="Attachment"
            width="100%"
            height="400"
            src={url + '#navpanes=0'}
            allowFullScreen={true}
            frameBorder={0}
            seamless={true}
          />
        </div>
      )}
      {contentType === ContentType.CDA_XML && <CcdaDisplay url={url} />}
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

/**
 * Returns the URL only when it cannot load a page of the current app.
 * Same-origin and relative URLs are rejected, because the URL is rendered into an iframe and a link.
 * @param url - The attachment URL.
 * @returns The URL if it is a data, blob, or other-origin http(s) URL; otherwise undefined.
 */
function toSafeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const { protocol, origin } = new URL(url, window.location.href);
    if (protocol === 'data:' || protocol === 'blob:') {
      return url;
    }
    return (protocol === 'https:' || protocol === 'http:') && origin !== window.location.origin ? url : undefined;
  } catch {
    return undefined;
  }
}

function getDownloadName(title: string | undefined): string | undefined {
  // Title often contains the filename by convention
  return title?.includes('.') ? title : undefined;
}
