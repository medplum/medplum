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
});

describe('mapFhirToCcdaDateTime', () => {
  test('should handle YYYYMMDD', () => {
    expect(mapFhirToCcdaDateTime('2024-01-01')).toBe('20240101');
  });

  test('should handle YYYYMMDDHHMM', () => {
    expect(mapFhirToCcdaDateTime('2024-01-01T12:34:00Z')).toBe('20240101123400+0000');
  });
});
