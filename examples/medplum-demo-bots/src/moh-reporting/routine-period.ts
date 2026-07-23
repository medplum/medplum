// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type RoutineReportingFrequency = 'monthly' | 'quarterly' | 'annual';

export interface RoutineReportingPeriod {
  readonly frequency: RoutineReportingFrequency;
  readonly period: string;
  readonly start: string;
  readonly end: string;
}

export function getPreviousRoutineReportingPeriod(
  frequency: RoutineReportingFrequency,
  now = new Date()
): RoutineReportingPeriod {
  switch (frequency) {
    case 'monthly':
      return getPreviousMonthPeriod(now);
    case 'quarterly':
      return getPreviousQuarterPeriod(now);
    case 'annual':
      return getPreviousAnnualPeriod(now);
  }
}

export function parseRoutineReportingFrequency(value: string | undefined): RoutineReportingFrequency {
  if (value === 'monthly' || value === 'quarterly' || value === 'annual') {
    return value;
  }
  return 'monthly';
}

function getPreviousMonthPeriod(now: Date): RoutineReportingPeriod {
  const year = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const month = now.getUTCMonth() === 0 ? 11 : now.getUTCMonth() - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return {
    frequency: 'monthly',
    period: `${year}${(month + 1).toString().padStart(2, '0')}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getPreviousQuarterPeriod(now: Date): RoutineReportingPeriod {
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  const previousQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
  const year = currentQuarter === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const startMonth = (previousQuarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return {
    frequency: 'quarterly',
    period: `${year}Q${previousQuarter}`,
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

function getPreviousAnnualPeriod(now: Date): RoutineReportingPeriod {
  const year = now.getUTCFullYear() - 1;
  return {
    frequency: 'annual',
    period: year.toString(),
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    end: new Date(Date.UTC(year + 1, 0, 1)).toISOString(),
  };
}
