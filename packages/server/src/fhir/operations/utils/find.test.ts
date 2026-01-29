// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { findAlignedSlotTimes, findSlotTimes } from './find';
import type { SchedulingParameters } from './scheduling-parameters';

describe('findAlignedSlotTimes', () => {
  test('can find a slot that exactly coincides with the interval', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 60 }
    );
    expect(slots).toEqual([{ start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') }]);
  });

  test('returns empty when the interval is less than the duration', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 90 }
    );
    expect(slots).toEqual([]);
  });

  test('it finds slots aligned to hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 60, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
    ]);
  });

  test('it finds slots aligned to half hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
    ]);
  });

  test('it finds slots aligned to quarter hours', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:15:00Z'), end: new Date('2025-12-01T00:25:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:45:00Z'), end: new Date('2025-12-01T00:55:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:15:00Z'), end: new Date('2025-12-01T01:25:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
      { start: new Date('2025-12-01T01:45:00Z'), end: new Date('2025-12-01T01:55:00Z') },
    ]);
  });

  test('it finds slots aligned to ten minute marks', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 10, offsetMinutes: 0, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:10:00Z'), end: new Date('2025-12-01T00:20:00Z') },
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:40:00Z'), end: new Date('2025-12-01T00:50:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
      { start: new Date('2025-12-01T01:10:00Z'), end: new Date('2025-12-01T01:20:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:30:00Z'), end: new Date('2025-12-01T01:40:00Z') },
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by five minutes', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 5, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:05:00Z'), end: new Date('2025-12-01T00:15:00Z') },
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:35:00Z'), end: new Date('2025-12-01T00:45:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:05:00Z'), end: new Date('2025-12-01T01:15:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:35:00Z'), end: new Date('2025-12-01T01:45:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by 20 minutes', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: 20, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:20:00Z'), end: new Date('2025-12-01T00:30:00Z') },
      { start: new Date('2025-12-01T00:50:00Z'), end: new Date('2025-12-01T01:00:00Z') },
      { start: new Date('2025-12-01T01:20:00Z'), end: new Date('2025-12-01T01:30:00Z') },
      { start: new Date('2025-12-01T01:50:00Z'), end: new Date('2025-12-01T02:00:00Z') },
    ]);
  });

  test('offsetting alignment by a negative number', () => {
    // While we don't expect users to offset by a negative number, doing so can be helpful
    // for situations like "bufferBefore", where we want to check that availability starts
    // some time before the resulting slot start time.
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 30, offsetMinutes: -20, durationMinutes: 10 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:10:00Z'), end: new Date('2025-12-01T00:20:00Z') },
      { start: new Date('2025-12-01T00:40:00Z'), end: new Date('2025-12-01T00:50:00Z') },
      { start: new Date('2025-12-01T01:10:00Z'), end: new Date('2025-12-01T01:20:00Z') },
      { start: new Date('2025-12-01T01:40:00Z'), end: new Date('2025-12-01T01:50:00Z') },
    ]);
  });

  test('errors when alignment is zero', () => {
    expect(() => {
      findAlignedSlotTimes(
        { start: new Date('2025-12-01'), end: new Date('2025-12-08') },
        { alignment: 0, offsetMinutes: 0, durationMinutes: 10 }
      );
    }).toThrow('Invalid alignment');
  });

  test('maxCount option is respected', () => {
    const slots = findAlignedSlotTimes(
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T02:00:00Z') },
      { alignment: 15, offsetMinutes: 0, durationMinutes: 10, maxCount: 5 }
    );
    expect(slots).toEqual([
      { start: new Date('2025-12-01T00:00:00Z'), end: new Date('2025-12-01T00:10:00Z') },
      { start: new Date('2025-12-01T00:15:00Z'), end: new Date('2025-12-01T00:25:00Z') },
      { start: new Date('2025-12-01T00:30:00Z'), end: new Date('2025-12-01T00:40:00Z') },
      { start: new Date('2025-12-01T00:45:00Z'), end: new Date('2025-12-01T00:55:00Z') },
      { start: new Date('2025-12-01T01:00:00Z'), end: new Date('2025-12-01T01:10:00Z') },
    ]);
  });
});

describe('findSlotTimes', () => {
  test('finds slots of the requested duration', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 60,
      alignmentOffset: 0,
      serviceType: [],
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      { start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T12:20:00Z') },
      { start: new Date('2025-12-01T13:00:00Z'), end: new Date('2025-12-01T13:20:00Z') },
      { start: new Date('2025-12-01T14:00:00Z'), end: new Date('2025-12-01T14:20:00Z') },
    ]);
  });

  test('can offset alignment', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceType: [],
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      { start: new Date('2025-12-01T12:15:00Z'), end: new Date('2025-12-01T12:35:00Z') },
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
      { start: new Date('2025-12-01T13:45:00Z'), end: new Date('2025-12-01T14:05:00Z') },
      { start: new Date('2025-12-01T14:15:00Z'), end: new Date('2025-12-01T14:35:00Z') },
    ]);
  });

  test('can require buffer time around the slot', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 20,
      bufferAfter: 30,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceType: [],
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability)).toEqual([
      // Slot from 12:15-12:35 not found because it doesn't have enough bufferBefore
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
      { start: new Date('2025-12-01T13:45:00Z'), end: new Date('2025-12-01T14:05:00Z') },
      // Slot from 14:15-14:35 not found because it doesn't have enough bufferAfter
    ]);
  });

  test('respects the maxCount option', () => {
    const schedulingParameters: SchedulingParameters = {
      availability: [],
      duration: 20,
      bufferBefore: 0,
      bufferAfter: 0,
      alignmentInterval: 30,
      alignmentOffset: 15,
      serviceType: [],
    };
    const availability = [{ start: new Date('2025-12-01T12:00:00Z'), end: new Date('2025-12-01T15:00:00Z') }];
    expect(findSlotTimes(schedulingParameters, availability, { maxCount: 3 })).toEqual([
      { start: new Date('2025-12-01T12:15:00Z'), end: new Date('2025-12-01T12:35:00Z') },
      { start: new Date('2025-12-01T12:45:00Z'), end: new Date('2025-12-01T13:05:00Z') },
      { start: new Date('2025-12-01T13:15:00Z'), end: new Date('2025-12-01T13:35:00Z') },
    ]);
  });
});
