// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { evalFhirPath } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMedplumErrorHandler } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface FhirPathDisplayProps {
  readonly resource: Resource;
  readonly path: string;
  readonly propertyType: string;
}

export function FhirPathDisplay(props: FhirPathDisplayProps): JSX.Element | null {
  const onError = useMedplumErrorHandler();
  let value;

  try {
    value = evalFhirPath(props.path, props.resource);
  } catch (err) {
    onError(err, { source: 'FhirPathDisplay' });
    return null;
  }

  if (value.length > 1) {
    throw new Error(
      `Component "path" for "FhirPathDisplay" must resolve to a single element. \
       Received ${value.length} elements \
       [${JSON.stringify(value, null, 2)}]`
    );
  }
  return <ResourcePropertyDisplay value={value[0] || ''} propertyType={props.propertyType} />;
}
