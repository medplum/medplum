// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface EpiWeek {
  readonly year: number;
  readonly week: number;
  readonly period: string;
  readonly start: string;
  readonly end: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function getPreviousEpiWeek(now = new Date()): EpiWeek {
  const currentWeekStart = startOfIsoWeek(now);
  return getEpiWeek(new Date(currentWeekStart.getTime() - MS_PER_DAY));
}

export function getEpiWeek(date: Date): EpiWeek {
  const weekStart = startOfIsoWeek(date);
  const weekEnd = new Date(weekStart.getTime() + 7 * MS_PER_DAY);
  const thursday = new Date(weekStart.getTime() + 3 * MS_PER_DAY);
  const year = thursday.getUTCFullYear();
  const firstWeekStart = startOfIsoWeek(new Date(Date.UTC(year, 0, 4)));
  const week = Math.floor((weekStart.getTime() - firstWeekStart.getTime()) / (7 * MS_PER_DAY)) + 1;
  return {
    year,
    week,
    period: `${year}W${week.toString().padStart(2, '0')}`,
    start: weekStart.toISOString(),
    end: weekEnd.toISOString(),
  };
}

function startOfIsoWeek(date: Date): Date {
  const utcDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() - day + 1);
  return utcDate;
}
