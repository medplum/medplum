import { getDisplayString, Resource } from '@medplum/core';
import React, { useEffect, useState } from 'react';
import { MedplumLink } from './MedplumLink';
import { useMedplum } from './MedplumProvider';

export interface ResourceNameProps {
  resource?: Resource;
  reference?: string;
  alt?: string;
  link?: boolean;
}

export const ResourceName = (props: ResourceNameProps) => {
  const medplum = useMedplum();
  const [text, setText] = useState<string | undefined>(props.alt || '');

  useEffect(() => {
    if (props.resource) {
      setText(getDisplayString(props.resource));
      return;
    }

    if (props.reference) {
      medplum.readCachedReference(props.reference)
        .then((resource: Resource) => setText(getDisplayString(resource)));
    }
  }, [props.resource, props.reference]);

  return props.link ? (
    <MedplumLink to={props.reference}>{text}</MedplumLink>
  ) : (
    <span>{text}</span>
  );
};
