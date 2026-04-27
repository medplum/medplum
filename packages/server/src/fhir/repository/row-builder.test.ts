// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { encodeBase64 } from '@medplum/core';
import type { Binary, DocumentReference, Observation, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import type { ArrayColumnPaddingConfig, MedplumServerConfig } from '../../config/types';
import { DatabaseMode, getDatabasePool } from '../../database';
import { createTestProject, withTestContext } from '../../test.setup';
import { getProjectSystemRepo, Repository } from '../repo';
import type { ColumnValue } from './row-builder';
import { buildResourceRow, compareColumnValues } from './row-builder';

describe('Repository Row Builder', () => {
  let testProject: WithId<Project>;
  let systemRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    const { project } = await createTestProject();

    testProject = project;
    systemRepo = await getProjectSystemRepo(testProject);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Binary writes no search parameter columns', () => {
    const binary: Binary = {
      resourceType: 'Binary',
      id: randomUUID(),
      contentType: 'text/plain',
      data: encodeBase64('this is some test data'),
      meta: {
        lastUpdated: new Date().toISOString(),
        project: randomUUID(),
        tag: [{ system: 'https://example.com', code: 'tag' }],
        security: [{ system: 'https://example.com', code: 'security' }],
      },
    };

    expect(buildResourceRow(binary, Repository.VERSION)).toStrictEqual({
      id: binary.id,
      lastUpdated: binary.meta?.lastUpdated,
      deleted: false,
      projectId: binary.meta?.project,
      content: expect.any(String),
      __version: Repository.VERSION,
    });
  });

  describe('Array column padding', () => {
    let prevConfig: string | undefined;
    beforeEach(() => {
      const config = getConfig();
      prevConfig = config.arrayColumnPadding && JSON.stringify(config.arrayColumnPadding);
    });

    afterEach(() => {
      if (prevConfig) {
        const config = getConfig();
        config.arrayColumnPadding = JSON.parse(prevConfig);
      }
    });

    const ENSURE_PADDING: ArrayColumnPaddingConfig = {
      m: 1,
      lambda: 300,
      statisticsTarget: 1,
    };

    test.each([
      ['no config', undefined, false], // off by default
      [
        'no resourceType array',
        {
          identifier: {
            config: ENSURE_PADDING,
          },
        },
        true,
      ],
      [
        'resourceType in the resourceType array',
        {
          identifier: {
            resourceType: ['Patient', 'Observation'],
            config: ENSURE_PADDING,
          },
        },
        true,
      ],
      [
        'resourceType NOT in the resourceType array',
        {
          identifier: {
            resourceType: ['Patient'],
            config: ENSURE_PADDING,
          },
        },
        false,
      ],
      [
        'array with entry with no resourceType array in second element',
        {
          identifier: [
            {
              resourceType: ['Task'],
              config: ENSURE_PADDING,
            },
            {
              config: ENSURE_PADDING,
            },
          ],
        },
        true,
      ],
      [
        'array with resourceType in second entry resourceType array',
        {
          identifier: [
            {
              resourceType: ['Patient'],
              config: ENSURE_PADDING,
            },
            {
              resourceType: ['Task', 'Observation'],
              config: ENSURE_PADDING,
            },
          ],
        },
        true,
      ],
      [
        'array with resourceType NOT in any resourceType array',
        {
          identifier: [
            {
              resourceType: ['Patient'],
              config: ENSURE_PADDING,
            },
            {
              resourceType: ['Task'],
              config: ENSURE_PADDING,
            },
          ],
        },
        false,
      ],
    ])('with %s', async (_desc, arrayColumnPadding: MedplumServerConfig['arrayColumnPadding'] | undefined, shouldPad) =>
      withTestContext(async () => {
        const config = getConfig();
        if (arrayColumnPadding) {
          config.arrayColumnPadding = arrayColumnPadding;
        }
        const res = await systemRepo.createResource<Observation>({
          resourceType: 'Observation',
          status: 'unknown',
          code: { coding: [{ system: 'http://loinc.org', code: '72166-2', display: 'Test Observation' }] },
        });

        const db = getDatabasePool(DatabaseMode.READER);
        const results = await db.query('SELECT "__identifier" FROM "Observation" WHERE "id" = $1', [res.id]);
        if (shouldPad) {
          expect(results.rows).toStrictEqual([{ __identifier: ['00000000-0000-0000-0000-000000000000'] }]);
        } else {
          expect(results.rows).toStrictEqual([{ __identifier: [] }]);
        }

        // deleted rows also get padded
        await systemRepo.deleteResource(res.resourceType, res.id);

        if (shouldPad) {
          expect(results.rows).toStrictEqual([{ __identifier: ['00000000-0000-0000-0000-000000000000'] }]);
        } else {
          expect(results.rows).toStrictEqual([{ __identifier: [] }]);
        }
      })
    );
  });

  describe('Array column value sorting', () => {
    test('stores multi-valued reference column in sorted order (DocumentReference.author)', () =>
      withTestContext(async () => {
        const authorRefs = [
          'Practitioner/zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz',
          'Patient/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'Practitioner/11111111-1111-1111-1111-111111111111',
        ];
        const expected = [...authorRefs].sort(compareColumnValues);

        const doc = await systemRepo.createResource<DocumentReference>({
          resourceType: 'DocumentReference',
          status: 'current',
          content: [{ attachment: { url: 'https://example.com/doc.pdf' } }],
          author: [{ reference: authorRefs[0] }, { reference: authorRefs[1] }, { reference: authorRefs[2] }],
        });

        const db = getDatabasePool(DatabaseMode.READER);
        const results = await db.query('SELECT "author" FROM "DocumentReference" WHERE "id" = $1', [doc.id]);
        expect(results.rows).toStrictEqual([{ author: expected }]);
      }));

    test('same reference values in different resource order yield identical stored array', () =>
      withTestContext(async () => {
        const a = 'Patient/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
        const b = 'Practitioner/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
        const expected = [a, b].sort(compareColumnValues);

        const doc1 = await systemRepo.createResource<DocumentReference>({
          resourceType: 'DocumentReference',
          status: 'current',
          content: [{ attachment: { url: 'https://example.com/a.pdf' } }],
          author: [{ reference: b }, { reference: a }],
        });
        const doc2 = await systemRepo.createResource<DocumentReference>({
          resourceType: 'DocumentReference',
          status: 'current',
          content: [{ attachment: { url: 'https://example.com/b.pdf' } }],
          author: [{ reference: a }, { reference: b }],
        });

        const db = getDatabasePool(DatabaseMode.READER);
        const r1 = await db.query('SELECT "author" FROM "DocumentReference" WHERE "id" = $1', [doc1.id]);
        const r2 = await db.query('SELECT "author" FROM "DocumentReference" WHERE "id" = $1', [doc2.id]);
        expect(r1.rows).toStrictEqual([{ author: expected }]);
        expect(r2.rows).toStrictEqual([{ author: expected }]);
      }));

    test('stores multi-valued quantity column in sorted order (Observation.component)', () =>
      withTestContext(async () => {
        const values = [100.5, 3.14, 42];
        const expected = [...values].sort(compareColumnValues);

        const obs = await systemRepo.createResource<Observation>({
          resourceType: 'Observation',
          status: 'final',
          code: { text: 'component quantity sort test' },
          component: [
            {
              code: { text: 'first' },
              valueQuantity: { value: values[0], unit: '1', system: 'http://unitsofmeasure.org', code: '1' },
            },
            {
              code: { text: 'second' },
              valueQuantity: { value: values[1], unit: '1', system: 'http://unitsofmeasure.org', code: '1' },
            },
            {
              code: { text: 'third' },
              valueQuantity: { value: values[2], unit: '1', system: 'http://unitsofmeasure.org', code: '1' },
            },
          ],
        });

        const db = getDatabasePool(DatabaseMode.READER);
        const results = await db.query('SELECT "componentValueQuantity" FROM "Observation" WHERE "id" = $1', [obs.id]);
        expect(results.rows).toStrictEqual([{ componentValueQuantity: expected }]);
      }));
  });
});

describe('compareColumnValues', () => {
  describe('returns 0 when a === b', () => {
    test.each<[ColumnValue, ColumnValue]>([
      [null, null],
      [undefined, undefined],
      ['Patient/1', 'Patient/1'],
      ['https://example.org/fhir/Patient/abc', 'https://example.org/fhir/Patient/abc'],
      ['', ''],
      [' ', ' '],
      [0, 0],
      [-0, 0],
      [3.14, 3.14],
      [-100, -100],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
      [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
      [true, true],
      [false, false],
    ])('compareColumnValues(%p, %p) === 0', (a, b) => {
      expect(compareColumnValues(a, b)).toBe(0);
    });
  });

  describe('returns 1 when a is null or undefined and b is defined', () => {
    test.each<[ColumnValue, ColumnValue]>([
      [null, 'x'],
      [undefined, 'x'],
      [null, ''],
      [undefined, ''],
      [null, ' '],
      [undefined, 'Patient/1'],
      [null, 0],
      [undefined, 0],
      [null, -1],
      [undefined, 3.14],
      [undefined, Number.NaN],
      [null, Number.POSITIVE_INFINITY],
      [undefined, Number.MIN_SAFE_INTEGER],
      [null, false],
      [undefined, true],
    ])('compareColumnValues(%p, %p) === 1', (a, b) => {
      expect(compareColumnValues(a, b)).toBe(1);
    });
  });

  describe('null and undefined are equal', () => {
    test.each<[ColumnValue, ColumnValue, 0]>([
      [null, undefined, 0],
      [undefined, null, 0],
    ])('compareColumnValues(%p, %p) === %s', (a, b, expected) => {
      expect(compareColumnValues(a, b)).toBe(expected);
    });
  });

  describe('returns -1 when b is null or undefined and a is defined', () => {
    test.each<[ColumnValue, ColumnValue]>([
      ['x', null],
      ['x', undefined],
      ['', null],
      ['Patient/1', undefined],
      [0, null],
      [0, undefined],
      [-1, undefined],
      [3.14, null],
      [Number.NaN, null],
      [Number.POSITIVE_INFINITY, undefined],
      [false, null],
      [true, undefined],
    ])('compareColumnValues(%p, %p) === -1', (a, b) => {
      expect(compareColumnValues(a, b)).toBe(-1);
    });
  });

  describe('returns a - b when both operands are numbers', () => {
    test.each<[number, number, number]>([
      [1, 2, -1],
      [2, 1, 1],
      [0, -1, 1],
      [-1, -2, 1],
      [-1, 1, -2],
      [100, 50, 50],
      [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, 1],
      [Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER + 1, -1],
      [0, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      [Number.POSITIVE_INFINITY, 0, Number.POSITIVE_INFINITY],
      [Number.NEGATIVE_INFINITY, 0, Number.NEGATIVE_INFINITY],
      [0, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY],
    ])('compareColumnValues(%p, %p) === %p', (a, b, expected) => {
      expect(compareColumnValues(a, b)).toBe(expected);
    });

    test('NaN arithmetic and negative minus positive infinity', () => {
      expect(compareColumnValues(Number.NaN, 1)).toBeNaN();
      expect(compareColumnValues(1, Number.NaN)).toBeNaN();
      expect(compareColumnValues(Number.NaN, Number.NaN)).toBeNaN();
      expect(compareColumnValues(Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    });
  });

  describe('returns Number(a) - Number(b) when both operands are booleans', () => {
    test.each<[boolean, boolean, number]>([
      [false, true, -1],
      [true, false, 1],
    ])('compareColumnValues(%p, %p) === %p', (a, b, expected) => {
      expect(compareColumnValues(a, b)).toBe(expected);
    });
  });

  describe('uses String(a).localeCompare(String(b)) when types are not both number or both boolean', () => {
    test.each<[ColumnValue, ColumnValue]>([
      ['apple', 'banana'],
      ['banana', 'apple'],
      ['', 'z'],
      ['a', 'Z'],
      ['prefix', 'prefixLonger'],
      ['Observation/10', 'Observation/2'],
      [1, '2'],
      [0, '0'],
      [-5, '5'],
      [true, 'false'],
      [false, '0'],
      [1, true],
      [0, false],
      [false, 0],
      [true, 1],
    ])('compareColumnValues(%p, %p) matches localeCompare', (a, b) => {
      expect(compareColumnValues(a, b)).toBe(String(a).localeCompare(String(b)));
    });
  });
});
