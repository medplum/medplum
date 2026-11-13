// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, test } from 'vitest';
import { LOINC, OBSERVATION_INTERPRETATION, UCUM } from './constants';
import type { ExtractedLabReport } from './lab-report-utils';
import { buildDiagnosticReport } from './lab-report-utils';

describe('buildDiagnosticReport', () => {
  test('builds a minimal draft report with contained observations', () => {
    const input: ExtractedLabReport = {
      loincCode: '58410-2',
      display: 'Complete blood count panel',
      category: 'LAB',
      performerDisplay: 'Quest Diagnostics',
      effectiveDateTime: '2026-07-01T09:30:00Z',
      results: [
        {
          display: 'Hemoglobin',
          loincCode: '718-7',
          value: 11.2,
          unit: 'g/dL',
          interpretationCode: 'L',
          referenceRange: { low: 13.5, high: 17.5 },
        },
      ],
    };

    const report = buildDiagnosticReport(input);

    expect(report.resourceType).toBe('DiagnosticReport');
    expect(report.status).toBe('preliminary');
    expect(report.code).toStrictEqual({
      coding: [{ system: LOINC, code: '58410-2', display: 'Complete blood count panel' }],
      text: 'Complete blood count panel',
    });
    expect(report.category?.[0].coding?.[0].code).toBe('LAB');
    expect(report.effectiveDateTime).toBe('2026-07-01T09:30:00Z');

    // Performer is a display-only reference with no target
    expect(report.performer).toStrictEqual([{ display: 'Quest Diagnostics' }]);
    expect(report.performer?.[0].reference).toBeUndefined();

    // Result is a contained observation linked by local reference
    expect(report.result).toStrictEqual([{ reference: '#obs-1', display: 'Hemoglobin' }]);
    expect(report.contained).toHaveLength(1);

    const obs = report.contained?.[0] as any;
    expect(obs.resourceType).toBe('Observation');
    expect(obs.id).toBe('obs-1');
    expect(obs.status).toBe('preliminary');
    expect(obs.code.coding[0]).toStrictEqual({ system: LOINC, code: '718-7', display: 'Hemoglobin' });
    expect(obs.valueQuantity).toStrictEqual({ value: 11.2, unit: 'g/dL', system: UCUM, code: 'g/dL' });
    expect(obs.interpretation[0].coding[0]).toStrictEqual({ system: OBSERVATION_INTERPRETATION, code: 'L' });
    expect(obs.referenceRange[0].low).toStrictEqual({ value: 13.5, unit: 'g/dL', system: UCUM, code: 'g/dL' });
    expect(obs.referenceRange[0].high).toStrictEqual({ value: 17.5, unit: 'g/dL', system: UCUM, code: 'g/dL' });
    // Effective date is inherited from the report
    expect(obs.effectiveDateTime).toBe('2026-07-01T09:30:00Z');
    expect(obs.performer).toStrictEqual([{ display: 'Quest Diagnostics' }]);
  });

  test('falls back to text-only code when no LOINC is inferred', () => {
    const report = buildDiagnosticReport({ results: [{ display: 'Some unusual assay' }] });
    expect(report.code).toStrictEqual({ text: 'Laboratory report' });
    const obs = report.contained?.[0] as any;
    expect(obs.code).toStrictEqual({ text: 'Some unusual assay' });
    expect(obs.valueQuantity).toBeUndefined();
    expect(obs.valueString).toBeUndefined();
  });

  test('handles non-numeric (string) results', () => {
    const report = buildDiagnosticReport({
      results: [{ display: 'SARS-CoV-2 RNA', valueString: 'Not detected', referenceRange: { text: 'Not detected' } }],
    });
    const obs = report.contained?.[0] as any;
    expect(obs.valueString).toBe('Not detected');
    expect(obs.valueQuantity).toBeUndefined();
    expect(obs.referenceRange[0]).toStrictEqual({ text: 'Not detected' });
  });

  test('omits contained/result when there are no results', () => {
    const report = buildDiagnosticReport({ display: 'Empty report', results: [] });
    expect(report.contained).toBeUndefined();
    expect(report.result).toBeUndefined();
  });

  test('numbers multiple contained observations sequentially', () => {
    const report = buildDiagnosticReport({
      results: [{ display: 'A', value: 1 }, { display: 'B', value: 2 }, { display: 'C', value: 3 }],
    });
    expect(report.result).toStrictEqual([
      { reference: '#obs-1', display: 'A' },
      { reference: '#obs-2', display: 'B' },
      { reference: '#obs-3', display: 'C' },
    ]);
    expect((report.contained as any[]).map((o) => o.id)).toStrictEqual(['obs-1', 'obs-2', 'obs-3']);
  });

  test('drops an empty reference range and unit-less system', () => {
    const report = buildDiagnosticReport({
      results: [{ display: 'Count', value: 5, referenceRange: {} }],
    });
    const obs = report.contained?.[0] as any;
    expect(obs.referenceRange).toBeUndefined();
    // No unit -> no UCUM system attached
    expect(obs.valueQuantity).toStrictEqual({ value: 5, unit: undefined, system: undefined, code: undefined });
  });
});
