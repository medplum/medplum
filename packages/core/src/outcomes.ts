import { OperationOutcome } from './fhir';

const OK_ID = 'ok';
const CREATED_ID = 'created';
const NOT_MODIFIED_ID = 'not-modified';
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
};

export const created: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: CREATED_ID,
  issue: [{
    severity: 'information',
    code: 'information',
    details: {
      text: 'Created'
    }
  }]
};

export const notModified: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: NOT_MODIFIED_ID,
  issue: [{
    severity: 'information',
    code: 'information',
    details: {
      text: 'Not Modified'
    }
  }]
};

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
    // id: randomUUID(),
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

export function isOk(outcome: OperationOutcome): boolean {
  return outcome.id === OK_ID || outcome.id === CREATED_ID || outcome.id === NOT_MODIFIED_ID;
}

export function isNotFound(outcome: OperationOutcome): boolean {
  return outcome.id === NOT_FOUND_ID;
}

export function getStatus(outcome: OperationOutcome): number {
  if (outcome.id === OK_ID) {
    return 200;
  } else if (outcome.id === CREATED_ID) {
    return 201;
  } else if (outcome.id === NOT_MODIFIED_ID) {
    return 304;
  } else if (outcome.id === NOT_FOUND_ID) {
    return 404;
  } else {
    return 400;
  }
}

export function assertOk(outcome: OperationOutcome): void {
  if (!isOk(outcome)) {
    throw new OperationOutcomeError(outcome);
  }
}

export class OperationOutcomeError extends Error {
  readonly outcome: OperationOutcome;

  constructor(outcome: OperationOutcome) {
    super(outcome?.issue?.[0].details?.text);
    this.outcome = outcome;
  }
}
