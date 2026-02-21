// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mapCcdaToFhirDate, mapCcdaToFhirDateTime, mapFhirToCcdaDateTime } from './datetime';

describe('mapCcdaToFhirDate', () => {
  test('should handle YYYYMMDD', () => {
    expect(mapCcdaToFhirDate('20240101')).toBe('2024-01-01');
  });

  test('should handle YYYYMMDDHHMM', () => {
    expect(mapCcdaToFhirDate('202401011234')).toBe('2024-01-01');
  });

  test('should handle year only', () => {
    expect(mapCcdaToFhirDate('2024')).toBe('2024-01-01');
  });
});

describe('mapCcdaToFhirDateTime', () => {
  test('should handle YYYY', () => {
    expect(mapCcdaToFhirDateTime('2024')).toBe('2024-01-01T00:00:00Z');
  });

  test('should handle YYYYMMDD', () => {
    expect(mapCcdaToFhirDateTime('20240101')).toBe('2024-01-01T00:00:00Z');
  });

  test('should handle YYYYMMDDHHMM', () => {
    expect(mapCcdaToFhirDateTime('202401011234')).toBe('2024-01-01T12:34:00Z');
  });

  test('should handle YYYYMMDDHHMM-TZ (no seconds with timezone)', () => {
    expect(mapCcdaToFhirDateTime('201507221400-0500')).toBe('2015-07-22T14:00:00-05:00');
  });

  test('should handle YYYYMMDDHHMM+TZ (no seconds with positive timezone)', () => {
    expect(mapCcdaToFhirDateTime('201507221400+0530')).toBe('2015-07-22T14:00:00+05:30');
  });

  test('should handle YYYYMMDDHHMMSSzzzzz with timezone offset', () => {
    expect(mapCcdaToFhirDateTime('20241001090000-0500')).toBe('2024-10-01T09:00:00-05:00');
  });

  test('should handle positive timezone offset', () => {
    expect(mapCcdaToFhirDateTime('20241001090000+0530')).toBe('2024-10-01T09:00:00+05:30');
  });

  test('should handle negative timezone offset', () => {
    expect(mapCcdaToFhirDateTime('20241005120000-0500')).toBe('2024-10-05T12:00:00-05:00');
  });

  test('should convert +0000 timezone to Z', () => {
    expect(mapCcdaToFhirDateTime('20241001090000+0000')).toBe('2024-10-01T09:00:00Z');
  });

  test('should convert -0000 timezone to Z', () => {
    expect(mapCcdaToFhirDateTime('20241001090000-0000')).toBe('2024-10-01T09:00:00Z');
  });
});

describe('mapFhirToCcdaDateTime', () => {
  test('should handle YYYYMMDD', () => {
    expect(mapFhirToCcdaDateTime('2024-01-01')).toBe('20240101');
  });

  test('should handle YYYYMMDDHHMM', () => {
    expect(mapFhirToCcdaDateTime('2024-01-01T12:34:00Z')).toBe('20240101123400+0000');
  });
});
