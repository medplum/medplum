// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatCodeableConcept } from '@medplum/core';
import type { CodeableConcept } from '@medplum/fhirtypes';
import type { JSX } from 'react';

export interface CodeableConceptDisplayProps {
  readonly value?: CodeableConcept;
}

export function CodeableConceptDisplay(props: CodeableConceptDisplayProps): JSX.Element {
  return <>{formatCodeableConcept(props.value)}</>;
}
