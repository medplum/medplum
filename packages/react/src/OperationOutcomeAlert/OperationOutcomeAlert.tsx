import { Alert } from '@mantine/core';
import { OperationOutcomeIssue } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons';
import React from 'react';

export interface OperationOutcomeAlertProps {
  issues?: OperationOutcomeIssue[];
}

export function OperationOutcomeAlert(props: OperationOutcomeAlertProps): JSX.Element | null {
  if (!props.issues) {
    return null;
  }
  return (
    <Alert icon={<IconAlertCircle size={16} />} color="red">
      {props.issues.map((issue) => (
        <div data-testid="text-field-error" key={issue.details?.text}>
          {issue.details?.text}
        </div>
      ))}
    </Alert>
  );
}
