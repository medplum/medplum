import { allOk, badRequest, gone } from '@medplum/core';
import { getIssuesForExpression } from './outcomes';

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
});
