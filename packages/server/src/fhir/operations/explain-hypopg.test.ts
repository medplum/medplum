// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import { isUndefinedFunctionError, parseHypotheticalIndexStatements } from './explain';

describe('parseHypotheticalIndexStatements', () => {
  test('Parses multiple CREATE INDEX statements', () => {
    expect(
      parseHypotheticalIndexStatements(
        'CREATE INDEX ON "Appointment" ("projectId", "status"); CREATE UNIQUE INDEX ON "Patient" ("id")'
      )
    ).toStrictEqual([
      'CREATE INDEX ON "Appointment" ("projectId", "status")',
      'CREATE UNIQUE INDEX ON "Patient" ("id")',
    ]);
  });

  test('Ignores empty input', () => {
    expect(parseHypotheticalIndexStatements(undefined)).toStrictEqual([]);
    expect(parseHypotheticalIndexStatements('')).toStrictEqual([]);
    expect(parseHypotheticalIndexStatements(['', '  ;  '])).toStrictEqual([]);
  });

  test('Rejects statements that are not CREATE INDEX', () => {
    expect(() => parseHypotheticalIndexStatements('DROP INDEX "Patient_id_idx"')).toThrow(OperationOutcomeError);
  });

  test('Rejects CONCURRENTLY', () => {
    expect(() => parseHypotheticalIndexStatements('CREATE INDEX CONCURRENTLY ON "Patient" ("active")')).toThrow(
      OperationOutcomeError
    );
  });
});

describe('isUndefinedFunctionError', () => {
  test('Detects missing PostgreSQL functions', () => {
    expect(isUndefinedFunctionError({ code: '42883' })).toBe(true);
    expect(isUndefinedFunctionError({ code: '42P01' })).toBe(false);
    expect(isUndefinedFunctionError('nope')).toBe(false);
    expect(isUndefinedFunctionError(null)).toBe(false);
  });
});
