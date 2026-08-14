// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { availableTimeToBusinessHoursEntry } from './Calendar.utils';

describe('availableTimeToBusinessHoursEntry', () => {
  test('converts a simple weekday range', () => {
    const result = availableTimeToBusinessHoursEntry({
      daysOfWeek: ['mon', 'wed', 'fri'],
      availableStartTime: '09:00:00',
      availableEndTime: '17:00:00',
    });

    expect(result).toEqual([
      {
        daysOfWeek: [1, 3, 5],
        startTime: '09:00:00',
        endTime: '17:00:00',
      },
    ]);
  });

  test('converts allDay to the full 00:00-24:00 range', () => {
    const result = availableTimeToBusinessHoursEntry({
      daysOfWeek: ['sun'],
      allDay: true,
    });

    expect(result).toEqual([
      {
        daysOfWeek: [0],
        startTime: '00:00:00',
        endTime: '24:00:00',
      },
    ]);
  });

  test('returns no entries when daysOfWeek is missing', () => {
    expect(
      availableTimeToBusinessHoursEntry({ availableStartTime: '09:00:00', availableEndTime: '17:00:00' })
    ).toStrictEqual([]);
  });

  test('returns no entries when start/end times are missing and not allDay', () => {
    expect(availableTimeToBusinessHoursEntry({ daysOfWeek: ['mon'] })).toStrictEqual([]);
  });

  test('splits a range that wraps past midnight into two entries', () => {
    const result = availableTimeToBusinessHoursEntry({
      daysOfWeek: ['fri'],
      availableStartTime: '22:00:00',
      availableEndTime: '06:00:00',
    });

    expect(result).toEqual([
      {
        daysOfWeek: [5], // fri
        startTime: '22:00:00',
        endTime: '24:00:00',
      },
      {
        daysOfWeek: [6], // sat
        startTime: '00:00:00',
        endTime: '06:00:00',
      },
    ]);
  });

  test('wraps the following day back to Sunday when the range starts on Saturday', () => {
    const result = availableTimeToBusinessHoursEntry({
      daysOfWeek: ['sat'],
      availableStartTime: '22:00:00',
      availableEndTime: '06:00:00',
    });

    expect(result[1]).toMatchObject({
      daysOfWeek: [0], // sat + 1 wraps around to sun
      startTime: '00:00:00',
      endTime: '06:00:00',
    });
  });

  test('treats an exactly-equal start/end time as wrapping (24-hour range)', () => {
    const result = availableTimeToBusinessHoursEntry({
      daysOfWeek: ['mon'],
      availableStartTime: '09:00:00',
      availableEndTime: '09:00:00',
    });

    expect(result).toEqual([
      { daysOfWeek: [1], startTime: '09:00:00', endTime: '24:00:00' },
      { daysOfWeek: [2], startTime: '00:00:00', endTime: '09:00:00' },
    ]);
  });
});
