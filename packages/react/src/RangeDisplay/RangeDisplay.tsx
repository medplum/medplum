// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatRange } from '@medplum/core';
import { Range } from '@medplum/fhirtypes';
import { JSX } from 'react';

export interface RangeDisplayProps {
  readonly value?: Range;
}

export function RangeDisplay(props: RangeDisplayProps): JSX.Element | null {
  return <>{formatRange(props.value)}</>;
}
