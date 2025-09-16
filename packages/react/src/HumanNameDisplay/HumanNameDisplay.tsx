// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatHumanName, HumanNameFormatOptions } from '@medplum/core';
import { HumanName } from '@medplum/fhirtypes';
import { JSX } from 'react';

export interface HumanNameDisplayProps {
  readonly value?: HumanName;
  readonly options?: HumanNameFormatOptions;
}

export function HumanNameDisplay(props: HumanNameDisplayProps): JSX.Element | null {
  const name = props.value;
  if (!name) {
    return null;
  }

  return <>{formatHumanName(name, props.options)}</>;
}
