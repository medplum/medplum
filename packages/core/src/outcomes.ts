import { OperationOutcome } from '@medplum/fhirtypes';

const OK_ID = 'ok';
const CREATED_ID = 'created';
const GONE_ID = 'gone';
const NOT_MODIFIED_ID = 'not-modified';
const NOT_FOUND_ID = 'not-found';
const ACCESS_DENIED = 'access-denied';

export const allOk: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: OK_ID,
  issue: [
    {
      severity: 'information',
      code: 'information',
      details: {
        text: 'All OK',
      },
    },
  ],
};

export const created: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: CREATED_ID,
  issue: [
    {
      severity: 'information',
      code: 'information',
      details: {
        text: 'Created',
      },
    },
  ],
};

export const notModified: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: NOT_MODIFIED_ID,
  issue: [
    {
      severity: 'information',
      code: 'information',
      details: {
        text: 'Not Modified',
      },
    },
  ],
};

export const notFound: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: NOT_FOUND_ID,
  issue: [
    {
      severity: 'error',
      code: 'not-found',
      details: {
        text: 'Not found',
      },
    },
  ],
};

export const gone: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: GONE_ID,
  issue: [
    {
      severity: 'error',
      code: 'gone',
      details: {
        text: 'Gone',
      },
    },
  ],
};

export const accessDenied: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: ACCESS_DENIED,
  issue: [
    {
      severity: 'error',
      code: 'access-denied',
      details: {
        text: 'Access Denied',
      },
    },
  ],
};

export function badRequest(details: string, expression?: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'invalid',
        details: {
          text: details,
        },
        expression: expression ? [expression] : undefined,
      },
    ],
  };
}

export function isOk(outcome: OperationOutcome): boolean {
  return outcome.id === OK_ID || outcome.id === CREATED_ID || outcome.id === NOT_MODIFIED_ID;
}

export function isNotFound(outcome: OperationOutcome): boolean {
  return outcome.id === NOT_FOUND_ID;
}

export function isGone(outcome: OperationOutcome): boolean {
  return outcome.id === GONE_ID;
}

export function getStatus(outcome: OperationOutcome): number {
  if (outcome.id === OK_ID) {
    return 200;
  } else if (outcome.id === CREATED_ID) {
    return 201;
  } else if (outcome.id === NOT_MODIFIED_ID) {
    return 304;
  } else if (outcome.id === ACCESS_DENIED) {
    return 403;
  } else if (outcome.id === NOT_FOUND_ID) {
    return 404;
  } else if (outcome.id === GONE_ID) {
    return 410;
  } else {
    return 400;
  }
}

/**
 * Asserts that the operation completed successfully and that the resource is defined.
 * @param outcome The operation outcome.
 * @param resource The resource that may or may not have been returned.
 */
export function assertOk<T>(outcome: OperationOutcome, resource: T | undefined): asserts resource is T {
  if (!isOk(outcome) || resource === undefined) {
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
