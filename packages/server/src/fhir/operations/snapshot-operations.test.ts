// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ValueSet } from '@medplum/fhirtypes';
import type { Repository } from '../repo';
import { expandValueSet } from './expand';
import { validateCodingInValueSet } from './valuesetvalidatecode';

// Snapshot operations should never need database access or a backing CodeSystem.
const repo = new Proxy({} as Repository, {
  get: () => {
    throw new Error('Unexpected repository access');
  },
});
const system = 'https://example.org/synthetic';
function snapshot(): ValueSet {
  return {
    resourceType: 'ValueSet',
    status: 'active',
    expansion: {
      timestamp: '2026-01-01T00:00:00Z',
      total: 1002,
      contains: Array.from({ length: 1002 }, (_, i) => ({
        system,
        version: '1',
        code: `TEST-${i}`,
        display: `Synthetic ${i}`,
        designation: [{ language: 'es', value: `Sintetico ${i}` }],
      })),
    },
  };
}
test('Snapshot paging reaches the last codes without losing metadata or lying about totals', async () => {
  const result = await expandValueSet(repo, snapshot(), { offset: 1000, count: 5, includeDesignations: true });
  expect(result.expansion).toMatchObject({ total: 1002, offset: 1000 });
  expect(result.expansion?.contains).toHaveLength(2);
  expect(result.expansion?.contains?.[0]).toMatchObject({
    code: 'TEST-1000',
    version: '1',
    designation: [{ language: 'es', value: 'Sintetico 1000' }],
  });
  const first = await expandValueSet(repo, snapshot(), { count: 5000 });
  expect(first.expansion?.contains).toHaveLength(1000);
  expect(first.expansion?.total).toBe(1002);
});
test('Filtering precedes pagination and count zero is respected', async () => {
  const result = await expandValueSet(repo, snapshot(), { filter: 'Synthetic 100', offset: 1, count: 2 });
  expect(result.expansion).toMatchObject({ total: 3, offset: 1 });
  expect(result.expansion?.contains?.map((e) => e.code)).toEqual(['TEST-1000', 'TEST-1001']);
  expect((await expandValueSet(repo, snapshot(), { count: 0 })).expansion).toMatchObject({ total: 1002, contains: [] });
  expect((await expandValueSet(repo, snapshot(), { offset: 2000 })).expansion).toMatchObject({
    total: 1002,
    contains: [],
  });
});
test('Empty sets, display languages, and abstract concepts use snapshot semantics', async () => {
  const empty: ValueSet = {
    resourceType: 'ValueSet',
    status: 'active',
    expansion: { timestamp: '2026-01-01T00:00:00Z', total: 0 },
  };
  expect((await expandValueSet(repo, empty, {})).expansion).toMatchObject({ total: 0, offset: 0, contains: [] });
  const valueSet = snapshot();
  const entries = valueSet.expansion?.contains ?? [];
  entries[0].abstract = true;
  const translated = await expandValueSet(repo, valueSet, { displayLanguage: 'es', excludeNotForUI: true, count: 1 });
  expect(translated.expansion).toMatchObject({ total: 1001 });
  expect(translated.expansion?.contains?.[0]).toMatchObject({ code: 'TEST-1', display: 'Sintetico 1' });
});
test('Snapshot membership uses source versions and accepts only known displays', async () => {
  const valueSet = snapshot();
  expect(await validateCodingInValueSet(repo, valueSet, [{ system, code: 'TEST-1001' }])).toMatchObject({
    code: 'TEST-1001',
  });
  expect(
    await validateCodingInValueSet(repo, valueSet, [{ system, code: 'TEST-1001', display: 'Sintetico 1001' }])
  ).toMatchObject({ display: 'Sintetico 1001' });
  expect(await validateCodingInValueSet(repo, valueSet, [{ system, code: 'TEST-1001', version: '2' }])).toBeUndefined();
  expect(
    await validateCodingInValueSet(repo, valueSet, [{ system, code: 'TEST-1001', display: 'Wrong' }])
  ).toBeUndefined();
  expect(await validateCodingInValueSet(repo, valueSet, [{ system, code: 'MISSING' }])).toBeUndefined();
});
test('Partial snapshots cannot validate membership as though complete', async () => {
  const valueSet = snapshot();
  if (valueSet.expansion) {
    valueSet.expansion.total = 5000;
  }
  expect(await validateCodingInValueSet(repo, valueSet, [{ system, code: 'TEST-1' }])).toBeUndefined();
  await expect(expandValueSet(repo, valueSet, {})).rejects.toThrow('Missing ValueSet definition');
});
test.each([{ offset: -1 }, { count: -1 }, { offset: 0.5 }])('Rejects invalid pagination %j', async (params) => {
  await expect(expandValueSet(repo, snapshot(), params)).rejects.toThrow('Invalid expansion');
});

test('Filtered operation results retain their context and cannot become unqualified snapshots', async () => {
  const result = await expandValueSet(repo, snapshot(), { filter: 'Synthetic 1001' });
  expect(result.expansion?.parameter).toContainEqual({ name: 'filter', valueString: 'Synthetic 1001' });
  await expect(expandValueSet(repo, result, {})).rejects.toThrow('Missing ValueSet definition');
});
