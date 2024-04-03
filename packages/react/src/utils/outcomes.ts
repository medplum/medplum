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

const ARRAY_INDEX_REGEX = /\[\d+\]/;
function isExpressionMatch(expr1: string | undefined, expr2: string | undefined): boolean {
  // to make this behavior backwards compatible, if only one expression specifies array indexes, ignore all indexes
  const isExpr1Indexed = typeof expr1 === 'string' && ARRAY_INDEX_REGEX.test(expr1);
  const isExpr2Indexed = typeof expr2 === 'string' && ARRAY_INDEX_REGEX.test(expr2);
  if (isExpr1Indexed !== isExpr2Indexed) {
    expr1 = expr1?.replace(ARRAY_INDEX_REGEX, '');
    expr2 = expr2?.replace(ARRAY_INDEX_REGEX, '');
  }

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
