// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept } from '@medplum/fhirtypes';
import { StatusBadge } from '@medplum/react';
import type { JSX } from 'react';
import { getConditionStatusColor } from '../../utils/conditions';

/**
 * Props for ConditionStatusBadge.
 * - clinicalStatus: the Condition.clinicalStatus to show; nothing renders without a code.
 */
export interface ConditionStatusBadgeProps {
  readonly clinicalStatus: CodeableConcept | undefined;
}

export function ConditionStatusBadge(props: ConditionStatusBadgeProps): JSX.Element | null {
  const code = props.clinicalStatus?.coding?.[0]?.code;
  if (!code) {
    return null;
  }
  return <StatusBadge status={code} color={getConditionStatusColor(code)} variant="light" size="sm" />;
}
