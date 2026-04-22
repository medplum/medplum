// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { Bundle } from '@medplum/fhirtypes';
import { systemLogger } from '../logger';
import { classifyTable, CrossDivideScope } from './crossdivide';
import {
  collectTables,
  Column,
  Condition,
  Conjunction,
  Constant,
  DeleteQuery,
  Disjunction,
  InsertQuery,
  Negation,
  SelectQuery,
  SqlFunction,
  Union,
} from './sql';

beforeAll(() => {
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-types.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-resources.json') as Bundle);
  indexStructureDefinitionBundle(readJson('fhir/r4/profiles-medplum.json') as Bundle);
});

describe('classifyTable', () => {
  test('resource tables on the global side', () => {
    expect(classifyTable('User')).toBe('global');
    expect(classifyTable('ProjectMembership')).toBe('global');
    expect(classifyTable('Project')).toBe('global');
    expect(classifyTable('Login')).toBe('global'); // protected / global-only
  });

  test('resource tables on the non-global side', () => {
    expect(classifyTable('Patient')).toBe('non-global');
    expect(classifyTable('Observation')).toBe('non-global');
    expect(classifyTable('Practitioner')).toBe('non-global');
  });

  test('lookup and history tables classify as their parent resource', () => {
    expect(classifyTable('Patient_History')).toBe('non-global');
    expect(classifyTable('Patient_Token')).toBe('non-global');
    expect(classifyTable('Patient_References')).toBe('non-global');
    expect(classifyTable('ProjectMembership_References')).toBe('global');
    expect(classifyTable('User_History')).toBe('global');
  });

  test('aliases and non-resource tables are unknown', () => {
    expect(classifyTable('combined')).toBe('unknown');
    expect(classifyTable('T1')).toBe('unknown');
    expect(classifyTable('DatabaseMigration')).toBe('unknown');
    expect(classifyTable('')).toBe('unknown');
  });
});

describe('collectTables', () => {
  test('simple SELECT collects main table', () => {
    const q = new SelectQuery('Patient').column('id').where('id', '=', '123');
    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient']);
  });

  test('SELECT with inner join by table name collects both', () => {
    const q = new SelectQuery('Patient').join(
      'INNER JOIN',
      'Patient_References',
      'refs',
      new Condition('Patient.id', '=', new Column('refs', 'resource_id'))
    );
    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient', 'Patient_References']);
  });

  test('SELECT with lateral join to another SelectQuery collects both', () => {
    const q = new SelectQuery('Patient');
    q.join(
      'LEFT JOIN LATERAL',
      new SelectQuery('HumanName')
        .column('resourceId')
        .column('name')
        .whereExpr(new Condition('HumanName.resourceId', '=', new Column('Patient', 'id')))
        .orderBy(new Column('HumanName', 'resourceId'))
        .limit(1),
      q.getNextJoinAlias(),
      new Constant('true')
    );
    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['HumanName', 'Patient']);
  });

  test('SELECT with EXISTS subquery joining cross-divide tables', () => {
    // Mimics the shape of a chained search like ProjectMembership?profile.name=foo
    const subquery = new SelectQuery('ProjectMembership_References')
      .join(
        'INNER JOIN',
        'Practitioner',
        'target',
        new Condition('target.id', '=', new Column('ProjectMembership_References', 'resource_id'))
      )
      .where('target.name', '=', 'foo');
    const q = new SelectQuery('ProjectMembership').whereExpr(new SqlFunction('EXISTS', [subquery]));

    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(
      ['ProjectMembership', 'ProjectMembership_References', 'Practitioner'].sort()
    );
  });

  test('UNION inner query collects all branch tables', () => {
    // Mimics shape of _type=Patient,User
    const union = new Union(new SelectQuery('Patient'), new SelectQuery('User'));
    const q = new SelectQuery('combined', union);

    const into = new Set<string>();
    collectTables(q, into);
    // 'combined' is an alias (innerQuery is set) — skipped
    expect(Array.from(into).sort()).toEqual(['Patient', 'User']);
  });

  test('CTE expression gets walked', () => {
    const cteQuery = new SelectQuery('User');
    const q = new SelectQuery('Patient').withCte('u', cteQuery);

    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient', 'User']);
  });

  test('INSERT collects target table', () => {
    const q = new InsertQuery('Patient', [{ id: '123', content: '{}' }]);
    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient']);
  });

  test('DELETE with USING collects both', () => {
    const q = new DeleteQuery('Patient_History').using('Patient').where('id', '=', '123');
    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient', 'Patient_History']);
  });

  test('nested boolean expressions with subqueries are walked', () => {
    const sub = new SelectQuery('User').where('id', '=', '1');
    const q = new SelectQuery('Patient').whereExpr(
      new Conjunction([
        new Condition('Patient.id', '=', '1'),
        new Disjunction([new Negation(new SqlFunction('EXISTS', [sub])), new Condition('Patient.name', '=', 'bob')]),
      ])
    );

    const into = new Set<string>();
    collectTables(q, into);
    expect(Array.from(into).sort()).toEqual(['Patient', 'User']);
  });
});

describe('CrossDivideScope', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(systemLogger, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('single side does not log', () => {
    const scope = new CrossDivideScope('sql');
    scope.addTable('Patient');
    scope.addTable('Observation');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('both sides logs once', () => {
    const scope = new CrossDivideScope('sql');
    scope.addTable('Patient');
    scope.addTable('User');
    scope.addTable('Practitioner'); // additional non-global tables shouldn't re-log
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Cross-divide access',
      expect.objectContaining({ scope: 'sql', lastTable: 'User' })
    );
  });

  test('unknown tables do not contribute', () => {
    const scope = new CrossDivideScope('sql');
    scope.addTable('Patient');
    scope.addTable('combined'); // alias, unknown
    scope.addTable('T1'); // join alias, unknown
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('duplicate tables do not re-log', () => {
    const scope = new CrossDivideScope('sql');
    scope.addTable('Patient');
    scope.addTable('User');
    scope.addTable('User');
    scope.addTable('Patient');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  test('child SQL scope forwards to transaction scope', () => {
    const txn = new CrossDivideScope('transaction');
    const sql1 = new CrossDivideScope('sql', txn);
    const sql2 = new CrossDivideScope('sql', txn);

    sql1.addTable('Patient');
    expect(errorSpy).not.toHaveBeenCalled();

    sql2.addTable('User');
    // The txn scope sees both; the individual SQL scopes don't.
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith('Cross-divide access', expect.objectContaining({ scope: 'transaction' }));
  });

  test('intra-SQL cross-divide logs under sql scope and propagates to txn scope', () => {
    const txn = new CrossDivideScope('transaction');
    const sql = new CrossDivideScope('sql', txn);

    sql.addTable('ProjectMembership');
    sql.addTable('Practitioner');

    // Two logs: one per scope that first sees the crossing.
    expect(errorSpy).toHaveBeenCalledTimes(2);
    const scopes = errorSpy.mock.calls.map(([, payload]) => (payload as { scope: string }).scope);
    expect(scopes.sort()).toEqual(['sql', 'transaction']);
  });
});
