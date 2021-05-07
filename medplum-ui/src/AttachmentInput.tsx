import React, { useState, useEffect } from 'react';
import { PropertyDefinition } from 'medplum';
import { useMedplum } from './MedplumProvider';

export interface AttachmentInputProps {
  propertyPrefix?: string;
  property: PropertyDefinition;
  value?: any;
}

export function AttachmentInput(props: AttachmentInputProps) {
  const medplum = useMedplum();
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!props.value?.contentType || !props.value.contentType.startsWith('image/')) {
      setImageUrl(undefined);
      return;
    }

    medplum.readBlob(props.value.url)
      .then(imageBlob => setImageUrl(URL.createObjectURL(imageBlob)));

  }, [props.value?.url]);

  const inputName = (props.propertyPrefix ?? '') + props.property.key;
  const value = props.value;
  return (
    <div>
      <input name={inputName} type="hidden" value={JSON.stringify(value)} readOnly={true} />
      <div>{value?.contentType}</div>
      <div>{value?.url}</div>
      {imageUrl && <img src={imageUrl} />}
    </div>
  );
}
