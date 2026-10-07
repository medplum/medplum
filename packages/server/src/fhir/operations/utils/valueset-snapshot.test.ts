// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSet, ValueSetExpansion } from '@medplum/fhirtypes';
import { findSnapshotCoding, getValueSetSnapshot } from './valueset-snapshot';

const empty: ValueSet = {
  resourceType: 'ValueSet',
  status: 'active',
  expansion: { timestamp: '2026-01-01T00:00:00Z', total: 0 },
};
test('An explicit empty snapshot is complete', () => {
  expect(getValueSetSnapshot(empty)).toEqual([]);
});
test('Partial and parameterized expansions are not complete', () => {
  for (const expansion of [
    { ...(empty.expansion as ValueSetExpansion), total: 1 },
    { ...(empty.expansion as ValueSetExpansion), offset: 1 },
    { ...(empty.expansion as ValueSetExpansion), parameter: [{ name: 'filter', valueString: 'something' }] },
    { timestamp: (empty.expansion as ValueSetExpansion).timestamp },
  ]) {
    expect(getValueSetSnapshot({ ...empty, expansion })).toBeUndefined();
  }
});
test('Nested snapshots inherit system/version and retain flags and designations', () => {
  const snapshot: ValueSet = {
    ...empty,
    expansion: {
      ...(empty.expansion as ValueSetExpansion),
      total: 2,
      contains: [
        {
          system: 'https://example.org/synthetic',
          version: '1',
          contains: [
            { code: 'A', display: 'Alpha', designation: [{ language: 'es', value: 'Alfa' }] },
            { system: 'https://example.org/other', code: 'B', abstract: true },
          ],
        },
      ],
    },
  };
  const entries = getValueSetSnapshot(snapshot) ?? [];
  expect(entries).toHaveLength(2);
  expect(entries[0]).toMatchObject({ system: 'https://example.org/synthetic', version: '1', code: 'A' });
  expect(entries[1].version).toBeUndefined();
  expect(findSnapshotCoding(entries, [{ system: entries[0].system, code: 'A', display: 'Alfa' }])?.display).toBe(
    'Alfa'
  );
  expect(findSnapshotCoding(entries, [{ system: entries[0].system, code: 'A', version: '2' }])).toBeUndefined();
  expect(findSnapshotCoding(entries, [{ system: entries[0].system, code: 'A', display: 'Wrong' }])).toBeUndefined();
  expect(findSnapshotCoding(entries, [{ system: entries[0].system, code: 'missing' }])).toBeUndefined();
});
