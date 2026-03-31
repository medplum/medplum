// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { getSearchParameter } from '@medplum/core';
import type { Goal, Observation, RiskAssessment } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { buildRangeColumns } from './range-column';
import type { RangeColumnSearchParameterImplementation } from './searchparameter';
import { getSearchParameterImplementation } from './searchparameter';
import { loadStructureDefinitions } from './structure';

describe('buildRangeColumns', () => {
  beforeAll(() => {
    loadStructureDefinitions();
  });

  test('multi date range with mixed precision', () => {
    const targetDate = getSearchParameter('Goal', 'target-date');
    if (!targetDate) {
      throw new Error('Missing search parameter');
    }
    const impl = getSearchParameterImplementation('Goal', targetDate) as RangeColumnSearchParameterImplementation;
    expect(impl.searchStrategy).toStrictEqual('range-column');
    expect(impl.rangeColumnName).toStrictEqual('__targetDate');
    expect(impl.sortColumnName).toStrictEqual('__targetDateSort');

    const resource: Goal = {
      resourceType: 'Goal',
      lifecycleStatus: 'planned',
      description: { text: 'test' },
      subject: { reference: `Patient/${randomUUID()}` },
      target: [{ dueDate: '2026' }, { dueDate: '2028-01-31' }],
    };

    const columns: Record<string, any> = {};
    buildRangeColumns(targetDate, impl, columns, resource);

    expect(columns.__targetDate).toStrictEqual(
      `{[2026-01-01T00:00:00.000Z,2027-01-01T00:00:00.000Z),[2028-01-31T00:00:00.000Z,2028-02-01T00:00:00.000Z)}`
    );
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
  });
});
