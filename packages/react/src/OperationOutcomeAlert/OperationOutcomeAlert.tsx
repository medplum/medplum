import { Alert } from '@mantine/core';
import { operationOutcomeIssueToString } from '@medplum/core';
import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { IconAlertCircle } from '@tabler/icons-react';

export interface OperationOutcomeAlertProps {
  readonly outcome?: OperationOutcome;
  readonly issues?: OperationOutcomeIssue[];
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
          {operationOutcomeIssueToString(issue)}
        </div>
      ))}
    </Alert>
  );
}
