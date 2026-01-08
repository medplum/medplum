// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatMoney } from '@medplum/core';
import type { Money } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export interface MoneyDisplayProps {
  readonly value?: Money;
}

export function MoneyDisplay(props: MoneyDisplayProps): JSX.Element | null {
  return <>{formatMoney(props.value)}</>;
}
