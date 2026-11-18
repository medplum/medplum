// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { indexSearchParameter } from '@medplum/core';
import type { AccessPolicy, Observation, Patient, SearchParameter } from '@medplum/fhirtypes';
import { explain, findDeadEntries, findFieldIssues, matrixCell, OTHER_TYPE, searchScope } from './analyze';
import type { AccessRow } from './merge';
import { mergeAccessPolicies } from './merge';

function row(label: string, resource: AccessPolicy['resource'], parameters: AccessRow['parameters'] = []): AccessRow {
  return { label, policy: { resourceType: 'AccessPolicy', name: label, resource }, parameters };
}

describe('mergeAccessPolicies', () => {
  test('concatenates in order, substitutes parameters, and adds server rules', () => {
    const { entries, warnings } = mergeAccessPolicies(
      [
        row(
          'Org',
          [{ resourceType: 'Patient', criteria: 'Patient?organization=%org' }],
          [{ name: 'org', valueReference: { reference: 'Organization/1' } }]
        ),
        row('Self', [
          { resourceType: '*', criteria: '*?_compartment=%profile.id' },
          { resourceType: 'Task', readonly: true },
        ]),
        row('Typo', [{ resourceType: 'Observation', criteria: 'Observation?subject=%patinet' }]),
      ],
      { profile: 'Practitioner/p1', projectId: 'proj' }
    );

    expect(entries.map((e) => [e.entry.resourceType, e.entry.criteria])).toEqual([
      ['Patient', 'Patient?organization=Organization/1'],
      ['Bot', 'Bot?_compartment=p1'],
      ['*', '*?_compartment=p1'],
      ['Task', undefined],
      ['Observation', 'Observation?subject=%patinet'],
      ['SearchParameter', undefined],
      ['StructureDefinition', undefined],
      ['AccessPolicy', 'AccessPolicy?_compartment=p1'],
    ]);
    expect(entries[1].entry.readonlyFields).toEqual(['system']);
    expect(entries[3].entry.interaction).toEqual(['read', 'vread', 'history', 'search']);
    expect(warnings).toEqual([expect.objectContaining({ rowIndex: 2, message: expect.stringContaining('%patinet') })]);
  });

  test('last compartment wins, with a warning', () => {
    const a = row('A', []);
    const b = row('B', []);
    const result = mergeAccessPolicies(
      [
        { ...a, policy: { ...a.policy, compartment: { reference: 'Organization/a' } } },
        { ...b, policy: { ...b.policy, compartment: { reference: 'Organization/b' } } },
      ],
      { botSystemReadonly: false }
    );
    expect(result.compartment?.reference).toBe('Organization/b');
    expect(result.warnings[0].message).toContain('only the last one, "B"');
  });

  test('admins get project admin rules instead of their own admin-type entries', () => {
    const { entries } = mergeAccessPolicies([row('All', [{ resourceType: 'ProjectMembership' }])], {
      admin: true,
      projectId: 'proj',
      botSystemReadonly: false,
    });
    const memberships = entries.filter((e) => e.entry.resourceType === 'ProjectMembership');
    expect(memberships).toHaveLength(1);
    expect(memberships[0].source.kind).toBe('admin');
    expect(memberships[0].entry.criteria).toBe('ProjectMembership?_project=proj');
    // Same shape as the server's rules, so the merged JSON can be compared directly
    expect(entries.find((e) => e.entry.resourceType === 'Package')?.entry).toEqual({
      resourceType: 'Package',
      readonly: true,
    });
  });

  test('percent-encoded bytes are not reported as unfilled variables', () => {
    const { warnings } = mergeAccessPolicies(
      [row('Encoded', [{ resourceType: 'Patient', criteria: 'Patient?name=Jos%C3%A9' }])],
      {
        botSystemReadonly: false,
      }
    );
    expect(warnings).toEqual([]);
  });
});

describe('analysis', () => {
  const observation = (status: Observation['status']): Observation => ({
    resourceType: 'Observation',
    status,
    code: {},
  });
  const merged = mergeAccessPolicies(
    [
      row('Broad', [
        { resourceType: 'Patient' },
        { resourceType: 'Observation', criteria: 'Observation?status=final' },
      ]),
      row('Strict', [
        { resourceType: 'Patient', hiddenFields: ['ssn'], readonlyFields: ['identifier'] },
        { resourceType: 'Observation', hiddenFields: ['note'] },
      ]),
    ],
    { botSystemReadonly: false }
  ).entries;

  test('matrix flags conditional access and differing field rules', () => {
    // Strict's Patient rules never apply after Broad's unconditional entry; Observation depends on the criteria
    expect(matrixCell(merged, 'Patient', 'read')).toMatchObject({ status: 'all', fieldRulesVary: false });
    expect(matrixCell(merged, 'Observation', 'read')).toMatchObject({ status: 'all', fieldRulesVary: true });
    expect(matrixCell(merged, 'Encounter', 'read').status).toBe('denied');
    expect(matrixCell(merged, 'Login', 'read').status).toBe('protected');
    expect(matrixCell(merged, OTHER_TYPE, 'read').status).toBe('denied');
  });

  test('explain picks the first matching entry, using a sample resource when given', () => {
    const statuses = (resource?: Patient): string[] =>
      explain(merged, 'Patient', 'update', resource).map((r) => r.status);
    expect(statuses().slice(0, 4)).toEqual(['winner', 'type-mismatch', 'shadowed', 'type-mismatch']);

    const obs = explain(merged, 'Observation', 'read');
    expect(obs[1].status).toBe('conditional-winner');
    expect(obs[3].status).toBe('fallback');

    // Like core, a parameter the type doesn't define never matches; the detail names it
    expect(explain(merged, 'Observation', 'read', observation('final'))[1]).toMatchObject({
      status: 'criteria-failed',
      detail: expect.stringContaining('no search parameter "status"'),
    });

    indexSearchParameter({
      resourceType: 'SearchParameter',
      base: ['Observation'],
      code: 'status',
      type: 'token',
      expression: 'Observation.status',
    } as SearchParameter);
    const matching = explain(merged, 'Observation', 'read', observation('final'));
    expect(matching[1].status).toBe('winner');
    expect(matching[3].status).toBe('shadowed');
    const failing = explain(merged, 'Observation', 'read', observation('preliminary'));
    expect(failing[1].status).toBe('criteria-failed');
    expect(failing[3].status).toBe('winner');

    // Wildcard parameters apply to each type; a type without the parameter never matches, as in core
    const wildcard = mergeAccessPolicies([row('W', [{ resourceType: '*', criteria: '*?status=final' }])], {
      botSystemReadonly: false,
    }).entries;
    expect(explain(wildcard, 'Observation', 'read', observation('final'))[0].status).toBe('winner');
    const patient = explain(wildcard, 'Patient', 'read', { resourceType: 'Patient' })[0];
    expect(patient.status).toBe('criteria-failed');
    expect(patient.detail).toContain('no search parameter "status"');
  });

  test('explain does not name a sure winner after an entry it could not evaluate', () => {
    const chained = mergeAccessPolicies(
      [
        row('A', [
          { resourceType: 'Observation', criteria: 'Observation?subject.name=x', hiddenFields: ['note'] },
          { resourceType: 'Observation' },
        ]),
      ],
      { botSystemReadonly: false }
    ).entries;
    const rows = explain(chained, 'Observation', 'read', observation('final'));
    expect(rows[0].status).toBe('criteria-error');
    expect(rows[1]).toMatchObject({ status: 'fallback', detail: expect.stringContaining('unless #1 matches') });
  });

  test('field issues report bypassed and maybe-bypassed restrictions', () => {
    const issues = findFieldIssues(merged, ['Patient', 'Observation']);
    const patientUpdate = issues.find((i) => i.resourceType === 'Patient' && i.interaction === 'update');
    expect(patientUpdate).toMatchObject({
      severity: 'bypassed',
      lostHiddenFields: ['ssn'],
      lostReadonlyFields: ['identifier'],
    });
    const patientRead = issues.find((i) => i.resourceType === 'Patient' && i.interaction === 'read');
    expect(patientRead?.lostReadonlyFields).toEqual([]);
    const obsRead = issues.find((i) => i.resourceType === 'Observation' && i.interaction === 'read');
    expect(obsRead).toMatchObject({ severity: 'maybe-bypassed', lostHiddenFields: ['note'] });
  });

  test('dead entries are shadowed for every interaction they grant', () => {
    const dead = findDeadEntries(merged, ['Patient', 'Observation']);
    expect(dead.map((d) => d.entry.index)).toEqual([2]);
  });

  test('search scope ORs criteria, is lifted by unrestricted entries, and flags invalid criteria', () => {
    expect(searchScope(merged, 'Patient').unrestrictedBy?.index).toBe(0);
    const scoped = mergeAccessPolicies(
      [
        row('A', [
          { resourceType: '*', criteria: '*?_compartment=Patient/1' },
          { resourceType: 'Observation', criteria: 'Patient?name=x' },
        ]),
      ],
      { botSystemReadonly: false }
    ).entries;
    const scope = searchScope(scoped, 'Observation');
    expect(scope.unrestrictedBy).toBeUndefined();
    expect(scope.clauses.map((c) => c.criteria)).toEqual(['Observation?_compartment=Patient/1']);
    expect(scope.invalid.map((e) => e.index)).toEqual([1]);

    // The server stops at the first unrestricted entry, so invalid criteria after it never cause a 403
    const lifted = mergeAccessPolicies(
      [row('B', [{ resourceType: 'Observation' }, { resourceType: 'Observation', criteria: 'Patient?name=x' }])],
      { botSystemReadonly: false }
    ).entries;
    expect(searchScope(lifted, 'Observation')).toMatchObject({ unrestrictedBy: { index: 0 }, invalid: [] });
  });
});
