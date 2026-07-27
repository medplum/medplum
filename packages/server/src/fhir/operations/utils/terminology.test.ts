// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { CodeSystem, CodeSystemProperty } from '@medplum/fhirtypes';
import { SelectQuery, SqlBuilder } from '../../sql';
import { addDescendants, parentProperty } from './terminology';

describe('Terminology query builders', () => {
  const codeSystem = {
    resourceType: 'CodeSystem',
    id: '11111111-1111-1111-1111-111111111111',
    url: 'http://example.com/cs',
    hierarchyMeaning: 'is-a',
  } as WithId<CodeSystem>;
  const property = {
    id: '22222222-2222-2222-2222-222222222222',
    code: 'parent',
    uri: parentProperty,
    type: 'code',
  } as WithId<CodeSystemProperty>;

  test('addDescendants emits a literal `target > 0` predicate to use the partial reverse index', () => {
    const query = new SelectQuery('Coding').column('id').column('code').where('system', '=', codeSystem.id);
    const descendantQuery = addDescendants(query, codeSystem, property, 'ROOT');

    const sql = new SqlBuilder();
    descendantQuery.buildSql(sql);
    const text = sql.toString();

    // The recursive join must carry a `target > 0` bound, emitted as a SQL literal so the query planner can prove
    // the partial `Coding_Property_reverse_rel_lookup_idx` (target > 0) predicate at plan time.
    expect(text).toMatch(/"[^"]+"\."target" > 0/);
    // The `0` must be a literal, not a bound parameter (a generic plan couldn't prove the predicate otherwise).
    expect(sql.getValues()).not.toContain(0);
  });
});
