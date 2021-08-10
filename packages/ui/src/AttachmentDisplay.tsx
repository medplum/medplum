import { Attachment } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps) {
  const medplum = useMedplum();
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (props.value) {
      const { url, contentType } = props.value;
      if (url && (contentType?.startsWith('image/') || contentType?.startsWith('video/'))) {
        medplum.readBlobAsObjectUrl(url).then(setObjectUrl);
      }
    }

  }, [props.value?.url]);

  const value = props.value;

  if (value?.contentType?.startsWith('image/') && objectUrl) {
    return <img data-testid="attachment-image" style={{ maxWidth: props.maxWidth }} src={objectUrl} />;
  }

  if (value?.contentType?.startsWith('video/') && objectUrl) {
    return (
      <video data-testid="attachment-video" style={{ maxWidth: props.maxWidth }} controls={true}>
        <source type={value.contentType} src={objectUrl} />
      </video>
    );
  }

  return (
    <div data-testid="attachment-details">
      <div>{value?.title}</div>
      <div>{value?.contentType}</div>
      <div>{value?.url}</div>
    </div>
  );
}
