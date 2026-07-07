// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AlertProps } from '@mantine/core';
import { isOk } from '@medplum/core';
import type { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { OperationOutcomeAlert } from '@medplum/react';
import { IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface OutcomeAlertProps extends AlertProps {
  outcome: OperationOutcome | undefined;
}

type Severity = OperationOutcomeIssue['severity'];

const SEVERITY: Severity[] = ['information', 'warning', 'error', 'fatal'];

const COLORS: Record<Severity, string> = {
  information: 'blue',
  warning: 'yellow',
  error: 'orange',
  fatal: 'red',
};

function maxSeverity(outcome: OperationOutcome): Severity {
  return outcome.issue.reduce<OperationOutcomeIssue['severity']>(
    (acc, issue) => (SEVERITY.indexOf(issue.severity) < SEVERITY.indexOf(acc) ? acc : issue.severity),
    'information'
  );
}

/**
 * Shows an `<Alert>` component if the outcome exists and is something other
 * than 'ok', otherwise returns `null`. Styles the alert based on the highest
 * severity of issues
 *
 * @param props - The component props
 * @param props.outcome - The OperationOutcome to maybe display an `<Alert>` for
 * @returns - An `<Alert>` or null
 */
export function OutcomeAlert(props: OutcomeAlertProps): JSX.Element | null {
  const { outcome, ...alertProps } = props;
  if (!outcome || isOk(outcome)) {
    return null;
  }

  const severity = maxSeverity(outcome);
  const Icon = severity === 'information' ? IconInfoCircle : IconAlertCircle;

  return <OperationOutcomeAlert outcome={outcome} color={COLORS[severity]} icon={<Icon size={20} />} {...alertProps} />;
}
