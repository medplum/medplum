// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export interface IdentifierDisplayProps {
  readonly value?: Identifier;
}

export function IdentifierDisplay(props: IdentifierDisplayProps): JSX.Element {
  return (
    <div>
      {props.value?.system}: {props.value?.value}
    </div>
  );
}
