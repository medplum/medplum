import { Attachment } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';

export interface AttachmentDisplayProps {
  value?: Attachment;
  maxWidth?: number;
}

export function AttachmentDisplay(props: AttachmentDisplayProps) {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!props.value?.contentType || !props.value.contentType.startsWith('image/')) {
      setImageUrl(undefined);
      return;
    }

    if (props.value?.url) {
      medplum.readBlobAsObjectUrl(props.value?.url).then(url => setImageUrl(url));
    }

  }, [props.value?.url]);

  const value = props.value;

  if (imageUrl) {
    return <img style={{ maxWidth: props.maxWidth }} src={imageUrl} />;
  }

  return (
    <div>
      <div>{value?.title}</div>
      <div>{value?.contentType}</div>
      <div>{value?.url}</div>
    </div>
  );
}
