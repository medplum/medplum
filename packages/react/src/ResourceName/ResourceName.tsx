// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { TextProps } from '@mantine/core';
import { Text } from '@mantine/core';
import { getDisplayString, isOk, normalizeErrorString } from '@medplum/core';
import type { OperationOutcome, Reference, Resource } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
import { MedplumLink } from '../MedplumLink/MedplumLink';

export interface ResourceNameProps extends TextProps {
  readonly value?: Reference | Resource;
  readonly link?: boolean;
}

export function ResourceName(props: ResourceNameProps): JSX.Element | null {
  const { value, link, ...rest } = props;
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const resource = useResource(value, setOutcome);
  let text: string;

  if (outcome && !isOk(outcome)) {
    text = `[${normalizeErrorString(outcome)}]`;
  } else if (resource) {
    text = getDisplayString(resource);
  } else {
    return null;
  }

  return link ? (
    <MedplumLink to={value} {...rest}>
      {text}
    </MedplumLink>
  ) : (
    <Text component="span" {...rest}>
      {text}
    </Text>
  );
}
