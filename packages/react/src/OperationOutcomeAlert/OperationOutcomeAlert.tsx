// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AlertProps } from '@mantine/core';
import { Alert } from '@mantine/core';
import { operationOutcomeIssueToString } from '@medplum/core';
import type { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

export interface OperationOutcomeAlertProps extends Pick<
  AlertProps,
  'mb' | 'mt' | 'mx' | 'my' | 'ml' | 'mr' | 'pb' | 'pt' | 'px' | 'py' | 'pl' | 'pr'
> {
  readonly outcome?: OperationOutcome;
  readonly issues?: OperationOutcomeIssue[];
}

export function OperationOutcomeAlert(props: OperationOutcomeAlertProps): JSX.Element | null {
  const { outcome, issues: issuesProp, ...spacingProps } = props;
  const issues = outcome?.issue || issuesProp;
  if (!issues || issues.length === 0) {
    return null;
  }
  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red" {...spacingProps}>
      {issues.map((issue) => (
        <div data-testid="text-field-error" key={issue.details?.text}>
          {operationOutcomeIssueToString(issue)}
        </div>
      ))}
    </Alert>
  );
}
