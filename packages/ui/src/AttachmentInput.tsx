import { Attachment } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { useMedplum } from './MedplumProvider';

export interface AttachmentInputProps {
  name: string;
  value?: Attachment;
}

export function AttachmentInput(props: AttachmentInputProps) {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!props.value?.contentType || !props.value.contentType.startsWith('image/')) {
      setImageUrl(undefined);
      return;
    }

    if (props.value?.url) {
      medplum.readBlob(props.value?.url)
        .then(imageBlob => setImageUrl(URL.createObjectURL(imageBlob)));
    }

  }, [props.value?.url]);

  const value = props.value;
  return (
    <div data-testid="attachment-input">
      <input name={props.name} type="hidden" value={JSON.stringify(value)} readOnly={true} />
      <div>{value?.contentType}</div>
      <div>{value?.url}</div>
      {imageUrl && <img style={{ maxWidth: 100 }} src={imageUrl} />}
    </div>
  );
}
