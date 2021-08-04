import { getDisplayString, Reference, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';

export interface ResourceNameProps {
  resource?: Resource;
  reference?: Reference;
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
    if (props.resource) {
      setResource(props.resource);
      setLinkUrl(`/${props.resource.resourceType}/${props.resource.id}`)
    } else if (props.reference?.reference === 'system') {
      setText('System');
    } else if (props.reference) {
      setLinkUrl(`/${props.reference.reference}`)
      medplum.readCachedReference(props.reference).then(setResource);
    }
  }, [props.resource, props.reference]);

  return props.link && linkUrl ? (
    <MedplumLink to={linkUrl}>{text}</MedplumLink>
  ) : (
    <span>{text}</span>
  );
};
