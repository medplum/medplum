// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type Range = { start: Date; end: Date };

export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

// Matches R4 HealthcareService.availableTime format
export type AvailableTime = {
  daysOfWeek: DayOfWeek[];
  availableStartTime: string; // 'hh:mm:ss' FHIR Time format
  availableEndTime: string; // 'hh:mm:ss' FHIR Time format
};

export function isDayOfWeek(s: string): s is DayOfWeek {
  return s === 'mon' || s === 'tue' || s === 'wed' || s === 'thu' || s === 'fri' || s === 'sat' || s === 'sun';
}
