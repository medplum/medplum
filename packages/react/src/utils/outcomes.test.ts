import { allOk, badRequest, gone } from '@medplum/core';
import { getErrorsForInput, getIssuesForExpression } from './outcomes';
import { OperationOutcome } from '@medplum/fhirtypes';

const MISSING_PROP = 'Missing required property';
function missingProp(expression: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'structure',
        details: {
          text: MISSING_PROP,
        },
        expression: [expression],
      },
    ],
  };
}

describe('Outcome utils', () => {
  test('getIssuesForExpression', () => {
    expect(getIssuesForExpression(undefined, undefined)).toBeUndefined();
    expect(getIssuesForExpression(allOk, undefined)).toHaveLength(1);
    expect(getIssuesForExpression(gone, undefined)).toHaveLength(1);
    expect(getIssuesForExpression(allOk, 'expr')).toHaveLength(0);
    expect(getIssuesForExpression(gone, 'expr')).toHaveLength(0);
    expect(getIssuesForExpression(badRequest('bad'), undefined)).toHaveLength(1);
    expect(getIssuesForExpression(badRequest('bad', 'expr'), undefined)).toHaveLength(0);
    expect(getIssuesForExpression(badRequest('bad', 'expr'), 'expr')).toHaveLength(1);
    expect(getIssuesForExpression(badRequest('bad', 'Patient.name'), 'name')).toHaveLength(1);
    expect(getIssuesForExpression(badRequest('bad', 'name'), 'Patient.name')).toHaveLength(1);
    expect(getIssuesForExpression(badRequest('bad', 'Practitioner.name'), 'Patient.name')).toHaveLength(0);
  });

  describe('getErrorsForInput', () => {
    test('match without indexes', () => {
      expect(getErrorsForInput(missingProp('identifier.system'), 'identifier.system')).toEqual(MISSING_PROP);
    });

    test('exact match with indexes', () => {
      expect(getErrorsForInput(missingProp('identifier[1].system'), 'identifier[1].system')).toEqual(MISSING_PROP);
    });
    test('mismatched indexes', () => {
      expect(getErrorsForInput(missingProp('identifier[1].system'), 'identifier[0].system')).toEqual('');
    });
    test('indexes only on outcome', () => {
      expect(getErrorsForInput(missingProp('identifier[1].system'), 'identifier.system')).toEqual(MISSING_PROP);
    });
    test('indexes only on client', () => {
      expect(getErrorsForInput(missingProp('identifier.system'), 'identifier[1].system')).toEqual(MISSING_PROP);
    });
  });
});
