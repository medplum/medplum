import { randomUUID } from 'crypto';
import { OperationOutcome } from '@medplum/core';

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

export const badRequest: (details: string) => OperationOutcome = (details: string) => ({
  resourceType: 'OperationOutcome',
  id: randomUUID(),
  issue: [{
    severity: 'error',
    code: 'invalid',
    details: {
      text: details
    }
  }]
});
