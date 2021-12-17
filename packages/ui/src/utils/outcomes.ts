import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';

export function getIssuesForExpression(
  outcome: OperationOutcome | undefined,
  expression: string | undefined
): OperationOutcomeIssue[] | undefined {
  if (!outcome || !expression) {
    return undefined;
  }
  return outcome.issue?.filter((issue) => issue.expression?.[0] === expression);
}
