// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatRange } from '@medplum/core';
import type { Range } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export interface RangeDisplayProps {
  readonly value?: Range;
  readonly precision?: number;
  readonly exclusive?: boolean;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  return <>{formatRange(props.value, props.precision, props.exclusive)}</>;
}
