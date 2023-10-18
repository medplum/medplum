import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { Constraint } from './typeschema/types';

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

export function accepted(location: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: ACCEPTED_ID,
    issue: [
      {
        severity: 'information',
        code: 'informational',
        details: {
          text: 'Accepted',
        },
        diagnostics: location,
      },
    ],
  };
}

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
  return (
    outcome.id === OK_ID || outcome.id === CREATED_ID || outcome.id === NOT_MODIFIED_ID || outcome.id === ACCEPTED_ID
  );
}

export function isCreated(outcome: OperationOutcome): boolean {
  return outcome.id === CREATED_ID;
}

export function isAccepted(outcome: OperationOutcome): boolean {
  return outcome.id === ACCEPTED_ID;
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
  } else if (outcome.id === ACCEPTED_ID) {
    return 202;
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
  if (typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return JSON.stringify(error);
}

/**
 * Returns a string represenation of the operation outcome.
 * @param outcome The operation outcome.
 * @returns The string representation of the operation outcome.
 */
export function operationOutcomeToString(outcome: OperationOutcome): string {
  const strs = outcome.issue?.map(operationOutcomeIssueToString) ?? [];
  return strs.length > 0 ? strs.join('; ') : 'Unknown error';
}

/**
 * Returns a string represenation of the operation outcome issue.
 * @param issue The operation outcome issue.
 * @returns The string representation of the operation outcome issue.
 */
export function operationOutcomeIssueToString(issue: OperationOutcomeIssue): string {
  let issueStr;
  if (issue.details?.text) {
    if (issue.diagnostics) {
      issueStr = `${issue.details.text} (${issue.diagnostics})`;
    } else {
      issueStr = issue.details.text;
    }
  } else if (issue.diagnostics) {
    issueStr = issue.diagnostics;
  } else {
    issueStr = 'Unknown error';
  }
  if (issue.expression?.length) {
    issueStr += ` (${issue.expression.join(', ')})`;
  }
  return issueStr;
}

type IssueType = 'structure' | 'invariant' | 'processing';

function errorIssue(code: IssueType, message: string, path: string, data?: Record<string, any>): OperationOutcomeIssue {
  const issue: OperationOutcomeIssue = {
    severity: 'error',
    code,
    details: {
      text: message,
    },
    expression: [path],
  };
  if (data) {
    issue.diagnostics = JSON.stringify(data);
  }
  return issue;
}

export function createStructureIssue(expression: string, details: string): OperationOutcomeIssue {
  return errorIssue('structure', details, expression);
}

export function createConstraintIssue(expression: string, constraint: Constraint): OperationOutcomeIssue {
  return errorIssue('invariant', `Constraint ${constraint.key} not met: ${constraint.description}`, expression, {
    fhirpath: constraint.expression,
  });
}

export function createProcessingIssue(
  expression: string,
  message: string,
  err: Error,
  data?: Record<string, any>
): OperationOutcomeIssue {
  return errorIssue('processing', message, expression, { ...data, error: err });
}
