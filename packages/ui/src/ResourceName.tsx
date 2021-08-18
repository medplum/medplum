import { getDisplayString, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';

export interface ResourceNameProps {
  value?: Reference | Resource;
  alt?: string;
  link?: boolean;
}

export const ResourceName = (props: ResourceNameProps) => {
  const medplum = useMedplum();
  const [text, setText] = useState<string | undefined>(props.alt || '');
  const [linkUrl, setLinkUrl] = useState<string | undefined>();

  function setResource(resource: Resource) {
    setText(getDisplayString(resource));
  }

  useEffect(() => {
    const value = props.value;
    if (value) {
      if ('resourceType' in value) {
        const resource = value;
        setResource(resource);
        setLinkUrl(`/${resource.resourceType}/${resource.id}`);
      } else if ('reference' in value) {
        const reference = value;
        if (reference.reference === 'system') {
          setText('System');
        } else {
          setLinkUrl(`/${reference.reference}`)
          medplum.readCachedReference(reference).then(setResource);
        }
      }
    }
  }, [props.value]);

  return props.link && linkUrl ? (
    <MedplumLink to={linkUrl}>{text}</MedplumLink>
  ) : (
    <span>{text}</span>
  );
};
