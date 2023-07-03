import { Alert } from '@mantine/core';
import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons-react';
import React from 'react';

export interface OperationOutcomeAlertProps {
  outcome?: OperationOutcome;
  issues?: OperationOutcomeIssue[];
}

export function OperationOutcomeAlert(props: OperationOutcomeAlertProps): JSX.Element | null {
  const issues = props.outcome?.issue || props.issues;
  if (!issues || issues.length === 0) {
    return null;
  }
  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red">
      {issues.map((issue) => (
        <div data-testid="text-field-error" key={issue.details?.text}>
          {issue.details?.text}
        </div>
      ))}
    </Alert>
  );
}
