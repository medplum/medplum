// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { mergeOverlappingSlots } from './slots';

function createSlot(start: string, end: string, status: Slot['status'] = 'free'): Slot {
  return {
    resourceType: 'Slot',
    status,
    schedule: { reference: 'Schedule/test-schedule' },
    start,
    end,
  };
}

describe('mergeOverlappingSlots', () => {
  test('returns empty array for empty input', () => {
    expect(mergeOverlappingSlots([])).toEqual([]);
  });

  test('returns single free slot unchanged', () => {
    const slot = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z');
    const result = mergeOverlappingSlots([slot]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(slot);
  });

  test('returns single busy-unavailable slot unchanged', () => {
    const slot = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z', 'busy-unavailable');
    const result = mergeOverlappingSlots([slot]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(slot);
  });

  test('keeps non-overlapping slots of the same status', () => {
    const slot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z');
    const slot2 = createSlot('2024-01-15T11:00:00Z', '2024-01-15T12:00:00Z');

    const result = mergeOverlappingSlots([slot1, slot2]);

    expect(result).toHaveLength(2);
    expect(result).toContain(slot1);
    expect(result).toContain(slot2);
  });

  test('removes slot completely contained within another', () => {
    const outerSlot = createSlot('2024-01-15T09:00:00Z', '2024-01-15T12:00:00Z');
    const innerSlot = createSlot('2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z');

    const result = mergeOverlappingSlots([outerSlot, innerSlot]);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(outerSlot);
  });

  test('extends earlier slot when overlapping slot extends beyond it', () => {
    const slot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T11:00:00Z');
    const slot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T12:00:00Z');

    const result = mergeOverlappingSlots([slot1, slot2]);

    // slot2 overlaps with slot1 and extends beyond, so slot1's end is extended
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(slot1.start);
    expect(result[0].end).toBe(slot2.end);
  });

  test('merges adjacent slots (end of one equals start of next)', () => {
    const slot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z');
    const slot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T11:00:00Z');

    const result = mergeOverlappingSlots([slot1, slot2]);

    expect(result).toHaveLength(1);
    expect(result[0].start).toEqual(slot1.start);
    expect(result[0].end).toEqual(slot2.end);
  });

  test('processes slots of different statuses independently', () => {
    // Two overlapping free slots
    const freeSlot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T11:00:00Z', 'free');
    const freeSlot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T12:00:00Z', 'free');

    // Two overlapping busy-unavailable slots
    const unavailableSlot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T11:00:00Z', 'busy-unavailable');
    const unavailableSlot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T12:00:00Z', 'busy-unavailable');

    const result = mergeOverlappingSlots([freeSlot1, freeSlot2, unavailableSlot1, unavailableSlot2]);

    // Each status group should have its overlaps merged independently
    expect(result).toHaveLength(2);
    const freeSlots = result.filter((s) => s.status === 'free');
    const unavailableSlots = result.filter((s) => s.status === 'busy-unavailable');
    expect(freeSlots).toHaveLength(1);
    expect(unavailableSlots).toHaveLength(1);
  });

  test('handles multiple overlapping slots in sequence', () => {
    const slot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:30:00Z');
    const slot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T11:30:00Z');
    const slot3 = createSlot('2024-01-15T11:00:00Z', '2024-01-15T12:30:00Z');

    const result = mergeOverlappingSlots([slot1, slot2, slot3]);

    // slot2 overlaps with slot1, extending slot1 to 11:30
    // slot3 starts at 11:00 which is before the extended end (11:30), so it extends further to 12:30
    // All slots merge into one
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(slot1.start);
    expect(result[0].end).toBe(slot3.end);
  });

  test('handles slots with same start time', () => {
    const shortSlot = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z');
    const longSlot = createSlot('2024-01-15T09:00:00Z', '2024-01-15T12:00:00Z');

    const result = mergeOverlappingSlots([shortSlot, longSlot]);

    // Both have same start, shorter one comes first in sort (same time)
    // The second slot starts at same time (which is < end of first), so it gets processed
    expect(result).toHaveLength(1);
  });

  test('does not mutate original array', () => {
    const slot1 = createSlot('2024-01-15T11:00:00Z', '2024-01-15T12:00:00Z');
    const slot2 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T10:00:00Z');
    const original = [slot1, slot2];

    mergeOverlappingSlots(original);

    expect(original[0]).toBe(slot1);
    expect(original[1]).toBe(slot2);
  });

  test('does not mutate input slot objects when merging overlapping slots', () => {
    const slot1 = createSlot('2024-01-15T09:00:00Z', '2024-01-15T11:00:00Z');
    const slot2 = createSlot('2024-01-15T10:00:00Z', '2024-01-15T12:00:00Z');
    const originalSlot1End = slot1.end;
    const originalSlot2End = slot2.end;

    mergeOverlappingSlots([slot1, slot2]);

    // Neither slot should be mutated
    expect(slot1.end).toBe(originalSlot1End);
    expect(slot2.end).toBe(originalSlot2End);
  });
});
