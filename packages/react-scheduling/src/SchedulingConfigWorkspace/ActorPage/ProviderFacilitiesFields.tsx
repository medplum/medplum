// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Loader } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Location, Reference } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { ServiceFacilitiesField } from '../ServiceFacilitiesField';

export interface ProviderFacilitiesFieldsProps {
  /** The service facilities the workspace may edit, as edited. Absent while the provider's roles are read. */
  readonly value?: readonly Reference<Location>[];
  /** The service facilities another system linked, each named, which can't be removed here. */
  readonly linked: readonly Reference<Location>[];
  /** Why the provider's roles could not be read, when they couldn't. */
  readonly error?: unknown;
  readonly onChange: (value: Reference<Location>[]) => void;
}

/**
 * The service facilities a provider works at: those the workspace may edit, and those another system linked.
 * @param props - The service facilities, the linked ones, and a change handler.
 * @returns The fields.
 */
export function ProviderFacilitiesFields(props: ProviderFacilitiesFieldsProps): JSX.Element {
  const { value, linked, error, onChange } = props;
  if (error) {
    return <Alert color="red">Service facilities could not be loaded: {normalizeErrorString(error)}</Alert>;
  }
  if (!value) {
    return <Loader size="sm" aria-label="Loading service facilities" />;
  }
  return <ServiceFacilitiesField value={value} onChange={onChange} linked={linked} />;
}
