// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { evalFhirPath, normalizeErrorString } from '@medplum/core';
import type { Resource } from '@medplum/fhirtypes';
import { useMedplumErrorHandler } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { ResourcePropertyDisplay } from '../ResourcePropertyDisplay/ResourcePropertyDisplay';

export interface FhirPathDisplayProps {
  readonly resource: Resource;
  readonly path: string;
  readonly propertyType: string;
}

export function FhirPathDisplay(props: FhirPathDisplayProps): JSX.Element | null {
  const onError = useMedplumErrorHandler();

  // Evaluate on every render, since expressions like now() and resources changed in place depend on
  // it, but report a failure from an effect keyed on its message, so a path that keeps failing the
  // same way is reported once rather than on every render.
  let value: unknown[] | undefined;
  let error: unknown;
  try {
    value = evalFhirPath(props.path, props.resource);
  } catch (err) {
    error = err;
  }
  const errorMessage = value === undefined ? normalizeErrorString(error) : undefined;

  const errorRef = useRef(error);
  useEffect(() => {
    errorRef.current = error;
  });

  useEffect(() => {
    if (errorMessage !== undefined) {
      onError(errorRef.current, { source: 'FhirPathDisplay' });
    }
  }, [errorMessage, props.path, onError]);

  if (value === undefined) {
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
