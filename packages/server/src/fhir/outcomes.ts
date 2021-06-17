import { OperationOutcome } from '@medplum/core';
import { randomUUID } from 'crypto';
import { Response } from 'express';
import { Result, ValidationError } from 'express-validator';

const OK_ID = 'ok';
const NOT_FOUND_ID = 'not-found';

export const allOk: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: OK_ID,
  issue: [{
    severity: 'information',
    code: 'information',
    details: {
      text: 'All OK'
    }
  }]
}

export const notFound: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: NOT_FOUND_ID,
  issue: [{
    severity: 'error',
    code: 'not-found',
    details: {
      text: 'Not found'
    }
  }]
};

export function badRequest(details: string, expression?: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: [{
      severity: 'error',
      code: 'invalid',
      details: {
        text: details
      },
      expression: (expression ? [expression] : undefined)
    }]
  };
}

export function invalidRequest(errors: Result<ValidationError>): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
    issue: errors.array().map(error => ({
      severity: 'error',
      code: 'invalid',
      expression: [error.param],
      details: { text: error.msg }
    }))
  };
}

export function isOk(outcome: OperationOutcome): boolean {
  return outcome.id === OK_ID;
}

export function isNotFound(outcome: OperationOutcome): boolean {
  return outcome.id === NOT_FOUND_ID;
}

export function getStatus(outcome: OperationOutcome): number {
  if (isOk(outcome)) {
    return 200;
  } else if (isNotFound(outcome)) {
    return 404;
  } else {
    return 400;
  }
}

export function sendOutcome(res: Response, outcome: OperationOutcome): Response<any, Record<string, any>> {
  return res.status(getStatus(outcome)).json(outcome);
}
