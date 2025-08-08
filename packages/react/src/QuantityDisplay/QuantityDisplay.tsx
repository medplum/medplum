// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatQuantity } from '@medplum/core';
import { Quantity } from '@medplum/fhirtypes';
import { JSX } from 'react';

export interface QuantityDisplayProps {
  readonly value?: Quantity;
}

export function QuantityDisplay(props: QuantityDisplayProps): JSX.Element | null {
  return <>{formatQuantity(props.value)}</>;
}
