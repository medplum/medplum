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
      expression: [error.param],
      details: { text: error.msg },
    })),
  };
}

export function sendOutcome(res: Response, outcome: OperationOutcome): Response<any, Record<string, any>> {
  return res.status(getStatus(outcome)).json(outcome);
}
