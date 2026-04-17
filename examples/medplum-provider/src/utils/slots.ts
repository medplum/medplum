// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Slot } from '@medplum/fhirtypes';

type DecoratedSlot = {
  slot: Slot;
  start: Date;
  end: Date;
};

export function mergeOverlappingSlots(slots: Slot[]): Slot[] {
  // Group slots by status
  const slotsByStatus: Record<string, DecoratedSlot[]> = {};
  slots.forEach((slot) => {
    if (!slotsByStatus[slot.status]) {
      slotsByStatus[slot.status] = [];
    }
    slotsByStatus[slot.status].push({
      slot,
      start: new Date(slot.start),
      end: new Date(slot.end),
    });
  });

  return Object.values(slotsByStatus).flatMap((statusSlots) => {
    return statusSlots
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .reduce<DecoratedSlot[]>((acc, ds) => {
        const last = acc.at(-1);
        if (!last) {
          return [ds];
        }

        if (ds.start <= last.end) {
          if (ds.end > last.end) {
            last.end = ds.end;
            last.slot = { ...last.slot, end: ds.slot.end };
          }
        } else {
          acc.push(ds);
        }

        return acc;
      }, [])
      .map((ds) => ds.slot);
  });
}
