import { getStatus } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Result, ValidationError } from 'express-validator';

export function invalidRequest(errors: Result<ValidationError>): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: errors.array().map((error) => ({
      severity: 'error',
      code: 'invalid',
      expression: getValidationErrorExpression(error),
      details: { text: error.msg },
    })),
  };
}

function getValidationErrorExpression(error: ValidationError): string[] | undefined {
  // ValidationError can be AlternativeValidationError | GroupedAlternativeValidationError | UnknownFieldsError | FieldValidationError
  if (error.type === 'field') {
    return [error.path];
  }
  return undefined;
}

export function sendOutcome(res: Response, outcome: OperationOutcome): Response<any, Record<string, any>> {
  return res.status(getStatus(outcome)).json(outcome);
}
