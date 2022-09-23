import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';

export function getErrorsForInput(
  outcome: OperationOutcome | undefined,
  expression: string | undefined
): string | undefined {
  return outcome?.issue
    ?.filter((issue) => isExpressionMatch(issue.expression?.[0], expression))
    ?.map((issue) => issue.details?.text)
    ?.join('\n');
}

export function getIssuesForExpression(
  outcome: OperationOutcome | undefined,
  expression: string | undefined
): OperationOutcomeIssue[] | undefined {
  return outcome?.issue?.filter((issue) => isExpressionMatch(issue.expression?.[0], expression));
}

function isExpressionMatch(expr1: string | undefined, expr2: string | undefined): boolean {
  // Expression can be either "fieldName" or "resourceType.fieldName"
  if (expr1 === expr2) {
    return true;
  }
  if (!expr1 || !expr2) {
    return false;
  }
  const dot1 = expr1.indexOf('.');
  if (dot1 >= 0 && expr1.substring(dot1 + 1) === expr2) {
    return true;
  }
  const dot2 = expr2.indexOf('.');
  if (dot2 >= 0 && expr2.substring(dot2 + 1) === expr1) {
    return true;
  }
  return false;
}
