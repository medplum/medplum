// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AddressFormatOptions } from '@medplum/core';
import { formatAddress } from '@medplum/core';
import type { Address } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export interface AddressDisplayProps {
  readonly value?: Address;
  readonly options?: AddressFormatOptions;
}

export function AddressDisplay(props: AddressDisplayProps): JSX.Element | null {
  const address = props.value;
  if (!address) {
    return null;
  }

  return <>{formatAddress(address, props.options)}</>;
}
