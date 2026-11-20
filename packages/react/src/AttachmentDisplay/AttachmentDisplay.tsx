// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor } from '@mantine/core';
import { ContentType } from '@medplum/core';
import type { Attachment } from '@medplum/fhirtypes';
import type { MedplumContext } from '@medplum/react-hooks';
import { useCachedBinaryUrl, useMedplumContext } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { CcdaDisplay } from '../CcdaDisplay/CcdaDisplay';
import { ScannedImage } from './ScannedImage';

export interface AttachmentDisplayProps {
  readonly value?: Attachment;
  readonly maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps): JSX.Element | null {
  // Optional context: AttachmentDisplay does not require a MedplumProvider
  const baseUrl = (useMedplumContext() as MedplumContext | undefined)?.medplum.getBaseUrl();
  const { contentType, data, url: storedUrl, title } = props.value ?? {};
  const uncachedUrl = toSafeUrl(storedUrl, baseUrl);
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
 * Same-origin URLs are rejected unless they are Medplum storage URLs (single-origin deployments),
 * because the URL is rendered into an iframe and a link. Other server paths can redirect to app pages.
 * @param url - The attachment URL.
 * @param baseUrl - The Medplum server base URL, if available.
 * @returns The URL if it is a data, blob, other-origin http(s), or Medplum storage URL; otherwise undefined.
 */
function toSafeUrl(url: string | undefined, baseUrl: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:') {
      return url;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return undefined;
    }
    if (parsed.origin !== window.location.origin) {
      return parsed.href;
    }
    if (!baseUrl) {
      return undefined;
    }
    // Return the parsed href so the browser loads exactly the path that was checked
    const storage = new URL('storage/', new URL(baseUrl, window.location.href));
    const isStorageUrl = storage.origin === parsed.origin && parsed.pathname.startsWith(storage.pathname);
    return isStorageUrl ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

function getDownloadName(title: string | undefined): string | undefined {
  // Title often contains the filename by convention
  return title?.includes('.') ? title : undefined;
}
