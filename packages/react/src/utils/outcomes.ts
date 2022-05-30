import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';

export function getIssuesForExpression(
  outcome: OperationOutcome | undefined,
  expression: string | undefined
): OperationOutcomeIssue[] | undefined {
  return outcome?.issue?.filter((issue) => issue.expression?.[0] === expression);
}
