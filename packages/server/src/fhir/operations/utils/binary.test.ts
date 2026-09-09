// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildBinaryIds } from './binary';

describe('Binary utils', () => {
  test('buildBinaryIds', () => {
    const set1 = new Set<string>();
    buildBinaryIds({ resourceType: 'Patient' }, set1);
    expect(set1.size).toBe(0);

    const set2 = new Set<string>();
    buildBinaryIds({ resourceType: 'Patient', photo: [{ url: 'Binary/123' }] }, set2);
    expect(set2.size).toBe(1);
    expect(set2.has('123')).toBeTruthy();
  });

  test('Nested and contained locations', () => {
    const set = new Set<string>();
    buildBinaryIds(
      {
        resourceType: 'DocumentReference',
        content: [{ attachment: { url: 'Binary/abc' } }],
        contained: [{ resourceType: 'Patient', photo: [{ url: 'Binary/def' }] }],
      } as any,
      set
    );
    expect(set.size).toBe(2);
    expect(set.has('abc')).toBeTruthy();
    expect(set.has('def')).toBeTruthy();
  });

  test('Multiple binaries are collected and deduped', () => {
    const set = new Set<string>();
    buildBinaryIds(
      {
        resourceType: 'Patient',
        photo: [{ url: 'Binary/123' }, { url: 'Binary/456' }, { url: 'Binary/123' }],
      },
      set
    );
    expect(set.size).toBe(2);
    expect(set.has('123')).toBeTruthy();
    expect(set.has('456')).toBeTruthy();
  });

  test('Inline base64 data is ignored', () => {
    const set = new Set<string>();
    buildBinaryIds(
      {
        resourceType: 'Patient',
        photo: [{ contentType: 'text/plain', data: Buffer.from('Binary/123').toString('base64').repeat(1000) }],
      },
      set
    );
    expect(set.size).toBe(0);
  });

  test('Non-binary urls are ignored', () => {
    const set = new Set<string>();
    buildBinaryIds(
      {
        resourceType: 'Patient',
        photo: [{ url: 'http://example.com/x' }, { url: 'Patient/123' }],
      },
      set
    );
    expect(set.size).toBe(0);
  });

  test('Invalid binary ids are rejected', () => {
    const set = new Set<string>();
    buildBinaryIds(
      {
        resourceType: 'Patient',
        photo: [{ url: 'Binary/' }, { url: 'Binary/ABC' }, { url: 'Binary/123?foo' }],
      },
      set
    );
    expect(set.size).toBe(0);
  });

  test('Non-url keys are ignored', () => {
    const set = new Set<string>();
    // The extension `url` is a definition URL, not an attachment, but we match it anyway
    buildBinaryIds({ resourceType: 'Patient', extension: [{ url: 'Binary/123', valueString: 'x' }] } as any, set);
    expect(set.has('123')).toBeTruthy();

    const set2 = new Set<string>();
    buildBinaryIds({ resourceType: 'Patient', identifier: [{ system: 'Binary/123' }] } as any, set2);
    expect(set2.size).toBe(0);

    const set3 = new Set<string>();
    buildBinaryIds({ resourceType: 'Binary', id: '123', path: 'Binary/456' } as any, set3);
    expect(set3.size).toBe(0);
  });
});
