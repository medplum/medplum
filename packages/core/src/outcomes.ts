import { OperationOutcome } from '@medplum/fhirtypes';

const OK_ID = 'ok';
const CREATED_ID = 'created';
const GONE_ID = 'gone';
const NOT_MODIFIED_ID = 'not-modified';
const NOT_FOUND_ID = 'not-found';
const UNAUTHORIZED_ID = 'unauthorized';
const FORBIDDEN_ID = 'forbidden';
const TOO_MANY_REQUESTS_ID = 'too-many-requests';
const ACCEPTED_ID = 'accepted';

export const allOk: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: OK_ID,
  issue: [
    {
      severity: 'information',
      code: 'informational',
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
      code: 'informational',
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
      code: 'informational',
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

export const unauthorized: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: UNAUTHORIZED_ID,
  issue: [
    {
      severity: 'error',
      code: 'login',
      details: {
        text: 'Unauthorized',
      },
    },
  ],
};

export const forbidden: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: FORBIDDEN_ID,
  issue: [
    {
      severity: 'error',
      code: 'forbidden',
      details: {
        text: 'Forbidden',
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
      code: 'deleted',
      details: {
        text: 'Gone',
      },
    },
  ],
};

export const tooManyRequests: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: TOO_MANY_REQUESTS_ID,
  issue: [
    {
      severity: 'error',
      code: 'throttled',
      details: {
        text: 'Too Many Requests',
      },
    },
  ],
};

export const accepted: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: ACCEPTED_ID,
  issue: [
    {
      severity: 'information',
      code: 'informational',
      details: {
        text: 'Accepted',
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

export function validationError(details: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: details,
        },
      },
    ],
  };
}

export function serverError(err: Error): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'exception',
        details: {
          text: 'Internal server error',
        },
        diagnostics: err.toString(),
      },
    ],
  };
}

export function isOperationOutcome(value: unknown): value is OperationOutcome {
  return typeof value === 'object' && value !== null && (value as any).resourceType === 'OperationOutcome';
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
  } else if (outcome.id === UNAUTHORIZED_ID) {
    return 401;
  } else if (outcome.id === FORBIDDEN_ID) {
    return 403;
  } else if (outcome.id === NOT_FOUND_ID) {
    return 404;
  } else if (outcome.id === GONE_ID) {
    return 410;
  } else if (outcome.id === TOO_MANY_REQUESTS_ID) {
    return 429;
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

  constructor(outcome: OperationOutcome, cause?: unknown) {
    super(operationOutcomeToString(outcome));
    this.outcome = outcome;
    this.cause = cause;
  }
}

/**
 * Normalizes an error object into an OperationOutcome.
 * @param error The error value which could be a string, Error, OperationOutcome, or other unknown type.
 * @returns The normalized OperationOutcome.
 */
export function normalizeOperationOutcome(error: unknown): OperationOutcome {
  if (error instanceof OperationOutcomeError) {
    return error.outcome;
  }
  if (isOperationOutcome(error)) {
    return error;
  }
  return badRequest(normalizeErrorString(error));
}

/**
 * Normalizes an error object into a displayable error string.
 * @param error The error value which could be a string, Error, OperationOutcome, or other unknown type.
 * @returns A display string for the error.
 */
export function normalizeErrorString(error: unknown): string {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    return error.message;
  }
  if (isOperationOutcome(error)) {
    return operationOutcomeToString(error);
  }
  return JSON.stringify(error);
}

/**
 * Returns a string represenation of the operation outcome.
 * @param outcome The operation outcome.
 * @returns The string representation of the operation outcome.
 */
export function operationOutcomeToString(outcome: OperationOutcome): string {
  const strs = [];
  if (outcome.issue) {
    for (const issue of outcome.issue) {
      let issueStr = issue.details?.text || 'Unknown error';
      if (issue.expression?.length) {
        issueStr += ` (${issue.expression.join(', ')})`;
      }
      strs.push(issueStr);
    }
  }
  return strs.length > 0 ? strs.join('; ') : 'Unknown error';
}
