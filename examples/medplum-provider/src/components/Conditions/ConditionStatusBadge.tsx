// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Condition } from '@medplum/fhirtypes';
import { StatusBadge } from '@medplum/react';
import type { JSX } from 'react';

/** Badge colors per clinical status, matching the Problems section of PatientSummary. */
const STATUS_COLORS: Record<string, string> = {
  active: 'green',
  recurrence: 'green',
  relapse: 'green',
  inactive: 'orange',
  remission: 'blue',
  resolved: 'teal',
};

/**
 * Props for ConditionStatusBadge.
 * - clinicalStatus: the Condition.clinicalStatus to show; nothing renders without a code.
 */
export interface ConditionStatusBadgeProps {
  readonly clinicalStatus: Condition['clinicalStatus'];
}

export function ConditionStatusBadge(props: ConditionStatusBadgeProps): JSX.Element | null {
  const code = props.clinicalStatus?.coding?.[0]?.code;
  if (!code) {
    return null;
  }
  return <StatusBadge status={code} color={STATUS_COLORS[code] ?? 'gray'} variant="light" size="sm" />;
}
