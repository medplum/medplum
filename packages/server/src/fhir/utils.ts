import { OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

export function checkForNull(value: unknown, path: string, issues: OperationOutcomeIssue[]): void {
  if (value === null) {
    issues.push(createStructureIssue(path, `Invalid null value`));
  } else if (Array.isArray(value)) {
    checkArrayForNull(value, path, issues);
  } else if (typeof value === 'object') {
    checkObjectForNull(value as Record<string, unknown>, path, issues);
  }
}

function checkArrayForNull(array: unknown[], path: string, issues: OperationOutcomeIssue[]): void {
  for (let i = 0; i < array.length; i++) {
    if (array[i] === undefined) {
      issues.push(createStructureIssue(`${path}[${i}]`, `Invalid undefined value`));
    } else {
      checkForNull(array[i], `${path}[${i}]`, issues);
    }
  }
}

function checkObjectForNull(obj: Record<string, unknown>, path: string, issues: OperationOutcomeIssue[]): void {
  for (const [key, value] of Object.entries(obj)) {
    checkForNull(value, `${path}${path ? '.' : ''}${key}`, issues);
  }
}

export function validationError(details: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    id: randomUUID(),
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

export function createStructureIssue(expression: string, details: string): OperationOutcomeIssue {
  return {
    severity: 'error',
    code: 'structure',
    details: {
      text: details,
    },
    expression: [expression],
  };
}
