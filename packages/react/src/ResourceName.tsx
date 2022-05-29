import { getDisplayString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { MedplumLink } from './MedplumLink';
import { useResource } from './useResource';

export interface ResourceNameProps {
  value?: Reference | Resource;
  link?: boolean;
}

export function ResourceName(props: ResourceNameProps): JSX.Element | null {
  const resource = useResource(props.value);
  if (!resource) {
    return null;
  }

  const text = getDisplayString(resource);

  return props.link ? <MedplumLink to={resource}>{text}</MedplumLink> : <span>{text}</span>;
}
