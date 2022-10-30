import { Text, TextProps } from '@mantine/core';
import { getDisplayString } from '@medplum/core';
import { Reference, Resource } from '@medplum/fhirtypes';
import React from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';
import { useResource } from '../useResource/useResource';

export interface ResourceNameProps extends TextProps {
  value?: Reference | Resource;
  link?: boolean;
}

export function ResourceName(props: ResourceNameProps): JSX.Element | null {
  const { value, link, ...rest } = props;
  const resource = useResource(value);
  if (!resource) {
    return null;
  }

  const text = getDisplayString(resource);

  return link ? (
    <MedplumLink to={resource} {...rest}>
      {text}
    </MedplumLink>
  ) : (
    <Text component="span" {...rest}>
      {text}
    </Text>
  );
}
