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
});
