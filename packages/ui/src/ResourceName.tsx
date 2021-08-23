import { getDisplayString, Reference, Resource } from '@medplum/core';
import React from 'react';
import { MedplumLink } from './MedplumLink';
import { useResource } from './useResource';

export interface ResourceNameProps {
  value?: Reference | Resource;
  link?: boolean;
}

export const ResourceName = (props: ResourceNameProps) => {
  const resource = useResource(props.value);
  if (!resource) {
    return null;
  }

  const text = getDisplayString(resource);
  const url = `/${resource.resourceType}/${resource.id}`;

  return props.link ? (
    <MedplumLink to={url}>{text}</MedplumLink>
  ) : (
    <span>{text}</span>
  );
};
