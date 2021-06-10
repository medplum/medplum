import { OperationOutcome } from '@medplum/core';
import { randomUUID } from 'crypto';

export const allOk: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: 'allok',
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
  id: 'not-found',
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
