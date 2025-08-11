// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { Constraint } from './typeschema/types';

const OK_ID = 'ok';
const CREATED_ID = 'created';
const GONE_ID = 'gone';
const NOT_MODIFIED_ID = 'not-modified';
const FOUND_ID = 'found';
const NOT_FOUND_ID = 'not-found';
const CONFLICT_ID = 'conflict';
const UNAUTHORIZED_ID = 'unauthorized';
const FORBIDDEN_ID = 'forbidden';
const PRECONDITION_FAILED_ID = 'precondition-failed';
const MULTIPLE_MATCHES_ID = 'multiple-matches';
const TOO_MANY_REQUESTS_ID = 'too-many-requests';
const ACCEPTED_ID = 'accepted';
const SERVER_TIMEOUT_ID = 'server-timeout';
const BUSINESS_RULE = 'business-rule';

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

export const unauthorizedTokenExpired: OperationOutcome = {
  ...unauthorized,
  issue: [
    ...unauthorized.issue,
    {
      severity: 'error',
      code: 'expired',
      details: {
        text: 'Token expired',
      },
    },
  ],
};

export const unauthorizedTokenAudience: OperationOutcome = {
  ...unauthorized,
  issue: [
    ...unauthorized.issue,
    {
      severity: 'error',
      code: 'invalid',
      details: {
        text: 'Token not issued for this audience',
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

export const preconditionFailed: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: PRECONDITION_FAILED_ID,
  issue: [
    {
      severity: 'error',
      code: 'processing',
      details: {
        text: 'Precondition Failed',
      },
    },
  ],
};

export const multipleMatches: OperationOutcome = {
  resourceType: 'OperationOutcome',
  id: MULTIPLE_MATCHES_ID,
  issue: [
    {
      severity: 'error',
      code: 'multiple-matches',
      details: {
        text: 'Multiple resources found matching condition',
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
        ...(expression ? { expression: [expression] } : undefined),
      },
    ],
  };
}

export function conflict(details: string, code?: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: CONFLICT_ID,
    issue: [
      {
        severity: 'error',
        code: 'conflict',
        details: {
          coding: code ? [{ code }] : undefined,
          text: details,
        },
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

export function serverTimeout(msg?: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: SERVER_TIMEOUT_ID,
    issue: [
      {
        severity: 'error',
        code: 'timeout',
        details: {
          text: msg ?? 'Server timeout',
        },
      },
    ],
  };
}

export function redirect(url: URL): OperationOutcome {
  const urlStr = url.toString();
  return {
    resourceType: 'OperationOutcome',
    id: FOUND_ID,
    issue: [
      {
        severity: 'information',
        code: 'informational',
        details: {
          coding: [{ system: 'urn:ietf:rfc:3986', code: urlStr }],
          text: 'Redirect to ' + urlStr,
        },
      },
    ],
  };
}

export function businessRule(key: string, message: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: BUSINESS_RULE,
    issue: [
      {
        severity: 'error',
        code: 'business-rule',
        details: { id: key, text: message },
      },
    ],
  };
}

/**
 * Returns true if the input is an Error object.
 * This should be replaced with `Error.isError` when it is more widely supported.
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/isError
 * @param value - The candidate value.
 * @returns True if the input is an Error object.
 */
export function isError(value: unknown): value is Error {
  // Quick type check
  if (!value || typeof value !== 'object') {
    return false;
  }

  // Fast path for same-realm errors using instanceof
  if (value instanceof Error) {
    return true;
  }

  // Handle DOMException case
  if (typeof DOMException !== 'undefined' && value instanceof DOMException) {
    return true;
  }

  // Cross-realm check using toString (most reliable method)
  return Object.prototype.toString.call(value) === '[object Error]';
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

export function isRedirect(outcome: OperationOutcome): boolean {
  return outcome.id === FOUND_ID;
}

export function isNotFound(outcome: OperationOutcome): boolean {
  return outcome.id === NOT_FOUND_ID;
}

export function isConflict(outcome: OperationOutcome): boolean {
  return outcome.id === CONFLICT_ID;
}

export function isGone(outcome: OperationOutcome): boolean {
  return outcome.id === GONE_ID;
}

export function isUnauthenticated(outcome: OperationOutcome): boolean {
  return outcome.id === UNAUTHORIZED_ID;
}

export function getStatus(outcome: OperationOutcome): number {
  switch (outcome.id) {
    case OK_ID:
      return 200;
    case CREATED_ID:
      return 201;
    case ACCEPTED_ID:
      return 202;
    case FOUND_ID:
      return 302;
    case NOT_MODIFIED_ID:
      return 304;
    case UNAUTHORIZED_ID:
      return 401;
    case FORBIDDEN_ID:
      return 403;
    case NOT_FOUND_ID:
      return 404;
    case CONFLICT_ID:
      return 409;
    case GONE_ID:
      return 410;
    case PRECONDITION_FAILED_ID:
    case MULTIPLE_MATCHES_ID:
      return 412;
    case BUSINESS_RULE:
      return 422;
    case TOO_MANY_REQUESTS_ID:
      return 429;
    case SERVER_TIMEOUT_ID:
      return 504;
    default:
      return outcome.issue?.[0]?.code === 'exception' ? 500 : 400;
  }
}

/**
 * Asserts that the operation completed successfully and that the resource is defined.
 * @param outcome - The operation outcome.
 * @param resource - The resource that may or may not have been returned.
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
 * @param error - The error value which could be a string, Error, OperationOutcome, or other unknown type.
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
 * @param error - The error value which could be a string, Error, OperationOutcome, or other unknown type.
 * @returns A display string for the error.
 */
export function normalizeErrorString(error: unknown): string {
  if (!error) {
    return 'Unknown error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (isError(error)) {
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
 * @param outcome - The operation outcome.
 * @returns The string representation of the operation outcome.
 */
export function operationOutcomeToString(outcome: OperationOutcome): string {
  const strs = outcome.issue?.map(operationOutcomeIssueToString) ?? [];
  return strs.length > 0 ? strs.join('; ') : 'Unknown error';
}

/**
 * Returns a string represenation of the operation outcome issue.
 * @param issue - The operation outcome issue.
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

export type IssueSeverity = 'error' | 'fatal' | 'warning' | 'information';
export type IssueType = 'structure' | 'invariant' | 'processing';

export function createOperationOutcomeIssue(
  severity: IssueSeverity,
  code: IssueType,
  message: string,
  path: string,
  data?: Record<string, any>
): OperationOutcomeIssue {
  const issue: OperationOutcomeIssue = {
    severity,
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
  return createOperationOutcomeIssue('error', 'structure', details, expression);
}

export function createConstraintIssue(expression: string, constraint: Constraint): OperationOutcomeIssue {
  return createOperationOutcomeIssue(
    'error',
    'invariant',
    `Constraint ${constraint.key} not met: ${constraint.description}`,
    expression,
    {
      fhirpath: constraint.expression,
    }
  );
}

export function createProcessingIssue(
  expression: string,
  message: string,
  err: Error,
  data?: Record<string, any>
): OperationOutcomeIssue {
  return createOperationOutcomeIssue('error', 'processing', message, expression, { ...data, error: err });
}
