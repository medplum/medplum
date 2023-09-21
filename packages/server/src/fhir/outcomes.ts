import { getStatus, isAccepted } from '@medplum/core';
import { OperationOutcome } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Result, ValidationError } from 'express-validator';
import { getRequestContext } from '../context';

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

export function sendOutcome(res: Response, outcome: OperationOutcome): Response {
  const ctx = getRequestContext();
  if (isAccepted(outcome) && outcome.issue?.[0].diagnostics) {
    res.set('Content-Location', outcome.issue[0].diagnostics);
  }
  return res.status(getStatus(outcome)).json({
    ...outcome,
    extension: [
      {
        url: 'https://medplum.com/fhir/StructureDefinition/tracing',
        extension: [
          { url: 'requestId', valueUuid: ctx.requestId },
          { url: 'traceId', valueUuid: ctx.traceId },
        ],
      },
    ],
  } as OperationOutcome);
}
