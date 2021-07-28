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

  function setResource(resource: Resource) {
    setText(getDisplayString(resource));
  }

  useEffect(() => {
    if (props.resource) {
      setResource(props.resource);
    } else if (props.reference) {
      medplum.readCachedReference(props.reference).then(setResource);
    }
  }, [props.resource, props.reference]);

  return props.link ? (
    <MedplumLink to={`/${props.reference?.reference}`}>{text}</MedplumLink>
  ) : (
    <span>{text}</span>
  );
};
