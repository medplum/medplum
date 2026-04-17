// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Filter } from '@medplum/core';
import { getSearchParameter, Operator } from '@medplum/core';
import type { AllergyIntolerance, Observation, RiskAssessment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { buildRangeColumns, buildRangeColumnsSearchFilter } from './range-column';
import type { RangeColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import { SqlBuilder } from './sql';
import { loadStructureDefinitions } from './structure';

beforeAll(() => {
  loadStructureDefinitions();
});

describe('buildRangeColumns', () => {
  test('multi date range with mixed precision', () => {
    const onset = getSearchParameter('AllergyIntolerance', 'onset');
    if (!onset) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation(
      'AllergyIntolerance',
      onset
    ) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__onset');
    expect(impl.sortColumnName).toStrictEqual('__onsetSort');

    const resource: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      patient: { reference: `Patient/${randomUUID()}` },
      reaction: [
        {
          manifestation: [{ text: 'Hives' }],
          onset: '2026',
        },
        {
          manifestation: [{ text: 'Swelling' }],
          onset: '2028-01-31',
        },
      ],
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(onset, impl, columns, resource);

    expect(columns.__onset).toStrictEqual(
      `{[2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z),[2028-01-31T00:00:00.000Z,2028-02-01T00:00:00.000Z)}`
    );
    expect(columns.__onsetSort).toStrictEqual('2026-01-01T00:00:00.000Z');
  });

  test('single date time', () => {
    const valueDate = getSearchParameter('Observation', 'value-date');
    if (!valueDate) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Observation', valueDate) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__valueDate');
    expect(impl.sortColumnName).toStrictEqual('__valueDateSort');

    const resource: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      valueDateTime: '2026-04-01T12:34:56Z',
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(valueDate, impl, columns, resource);

    expect(columns.__valueDate).toStrictEqual(`[2026-04-01T12:34:56.000Z,2026-04-01T12:34:57.000Z)`);
    expect(columns.__valueDateSort).toStrictEqual('2026-04-01T12:34:56.000Z');
  });

  test('explicit Period', () => {
    const valueDate = getSearchParameter('Observation', 'value-date');
    if (!valueDate) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Observation', valueDate) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__valueDate');
    expect(impl.sortColumnName).toStrictEqual('__valueDateSort');

    const resource: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      valuePeriod: {
        start: '2026-04-04T12:34:56Z',
        end: '2026-04-18T11:22:33.456Z',
      },
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(valueDate, impl, columns, resource);

    expect(columns.__valueDate).toStrictEqual(`[2026-04-04T12:34:56.000Z,2026-04-18T11:22:33.456Z]`);
    expect(columns.__valueDateSort).toStrictEqual('2026-04-04T12:34:56.000Z');
  });

  test('one-sided Period', () => {
    const valueDate = getSearchParameter('Observation', 'value-date');
    if (!valueDate) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Observation', valueDate) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__valueDate');
    expect(impl.sortColumnName).toStrictEqual('__valueDateSort');

    const resource: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      valuePeriod: {
        end: '2026-04-18T11:22:33.456Z',
      },
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(valueDate, impl, columns, resource);

    expect(columns.__valueDate).toStrictEqual(`(,2026-04-18T11:22:33.456Z]`);
    expect(columns.__valueDateSort).toStrictEqual('2026-04-18T11:22:33.456Z');
  });

  test('multi number range', () => {
    const probability = getSearchParameter('RiskAssessment', 'probability');
    if (!probability) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation(
      'RiskAssessment',
      probability
    ) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__probability');
    expect(impl.sortColumnName).toStrictEqual('__probabilitySort');

    const resource: RiskAssessment = {
      resourceType: 'RiskAssessment',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      prediction: [
        {
          outcome: { text: 'bad' },
          probabilityDecimal: 0.005,
        },
        {
          outcome: { text: 'very bad' },
          probabilityRange: {
            low: { value: 0.001 },
            high: { value: 0.0049 },
          },
        },
        {
          outcome: { text: 'catastrophic' },
          probabilityRange: {
            low: { value: 0.00002 },
          },
        },
      ],
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(probability, impl, columns, resource);

    expect(columns.__probability).toStrictEqual(`{[0.005,0.005],[0.001,0.0049],[0.00002,)}`);
    expect(columns.__probabilitySort).toStrictEqual(0.00002);
  });

  test('quantity range', () => {
    const value = getSearchParameter('Observation', 'value-quantity');
    if (!value) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Observation', value) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__valueQuantity');
    expect(impl.sortColumnName).toStrictEqual('__valueQuantitySort');

    const resource: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      valueQuantity: {
        value: 102,
        unit: 'deg.',
      },
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(value, impl, columns, resource);

    expect(columns.__valueQuantity).toStrictEqual(`[102,102]`);
    expect(columns.__valueQuantitySort).toStrictEqual(102);
  });
});

describe('buildRangeColumnsSearchFilter', () => {
  test('throws on incorrect search param type', () => {
    const gender = getSearchParameter('Patient', 'gender');
    if (!gender) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Patient', gender);
    expect(impl.searchStrategy).not.toStrictEqual('range-column');

    expect(() =>
      buildRangeColumnsSearchFilter('Patient', 'Patient', gender, {
        code: 'gender',
        operator: Operator.EQUALS,
        value: 'unknown',
      })
    ).toThrow('Invalid search strategy');
  });

  test.each<[Operator, string, string, string]>([
    [Operator.EQUALS, '2026', ' && $1', '[2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z)'],
    [Operator.EQUALS, '2020-02', ' && $1', '[2020-02-01T00:00:00.000Z,2020-03-01T00:00:00.000Z)'],
    [Operator.EQUALS, '2020-02-14', ' && $1', '[2020-02-14T00:00:00.000Z,2020-02-15T00:00:00.000Z)'],
    [
      Operator.NOT_EQUALS,
      '2020',
      'NOT ("AllergyIntolerance"."__onset" &&',
      '[2020-01-01T00:00:00.000Z,2021-01-01T00:00:00.000Z)',
    ],
    [Operator.LESS_THAN, '2025-03-02T12:34:56Z', ' && $1', '(,2025-03-02T12:34:56.000Z)'],
    [Operator.LESS_THAN_OR_EQUALS, '2024-04-04T12:34:56.789Z', ' && $1', '(,2024-04-04T12:34:56.790Z)'],
    [Operator.GREATER_THAN, '2022', ' && $1', '[2023-01-01T00:00:00.000Z,)'],
    [Operator.GREATER_THAN_OR_EQUALS, '2024-02-29T12:34:56Z', ' && $1', '[2024-02-29T12:34:56.000Z,)'],
    [Operator.STARTS_AFTER, '2026-01-31', ' >> $1', '[2026-01-31T00:00:00.000Z,2026-02-01T00:00:00.000Z)'],
    [Operator.ENDS_BEFORE, '2024-02-29', ' << $1', '[2024-02-29T00:00:00.000Z,2024-03-01T00:00:00.000Z)'],
  ])('constructs filter condition correctly for date value: %s %s', (operator, value, expectedSql, range) => {
    const onset = getSearchParameter('AllergyIntolerance', 'onset');
    if (!onset) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation(
      'AllergyIntolerance',
      onset
    ) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');

    const filter: Filter = { code: 'target-date', operator, value };
    const condition = buildRangeColumnsSearchFilter('AllergyIntolerance', 'AllergyIntolerance', onset, filter);

    const sql = new SqlBuilder();
    condition.buildSql(sql);
    expect(sql.toString()).toStrictEqual(expect.stringContaining(expectedSql));
    expect(sql.getValues()).toStrictEqual([range]);
  });

  test('constructs basic numeric range filter', () => {
    const probability = getSearchParameter('RiskAssessment', 'probability');
    if (!probability) {
      throw new Error('Missing search parameter');
    }

    const filter: Filter = { code: 'probability', operator: Operator.LESS_THAN, value: '0.05' };
    const condition = buildRangeColumnsSearchFilter('RiskAssessment', 'RiskAssessment', probability, filter);

    const sql = new SqlBuilder();
    condition.buildSql(sql);
    expect(sql.toString()).toStrictEqual(expect.stringContaining(' && $1'));
    expect(sql.getValues()).toStrictEqual(['(,0.05)']);
  });
});
