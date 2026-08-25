// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useEffect, useRef, useState } from 'react';
import { isSameDay, sortEnds } from './CalendarDateInput.utils';

export interface DayRangeDrag {
  /** The range being dragged out, if a drag is under way. */
  readonly range: { readonly start: Date; readonly end: Date } | undefined;
  /** Begins a drag on a day. */
  readonly begin: (date: Date) => void;
  /** Carries the drag under way, if any, out to a day. */
  readonly extend: (date: Date) => void;
  /** Whether the click now arriving is the tail of a drag, and so is spent. */
  readonly consumeClick: () => boolean;
  /** The day a shift-click measures its range from, as the last gesture left it. */
  readonly anchor: () => Date | undefined;
  /** Anchors on a day, so a shift-click measures its range from there. */
  readonly anchorOn: (date: Date) => void;
}

/**
 * Tracks the gestures that leave a range behind: a drag across calendar days,
 * which asks for the range it covers on release, and the day a shift-click
 * measures its range from.
 * @param onSelectRange - Called with the range a finished drag covered. A drag
 * is only tracked when this is given.
 * @returns The drag under way and the handlers that drive it.
 */
export function useDayRangeDrag(onSelectRange?: (start: Date, end: Date) => void): DayRangeDrag {
  const [from, setFrom] = useState<Date>();
  const [to, setTo] = useState<Date>();
  // Set when a drag has just ended, to swallow the click that follows it.
  const dragged = useRef(false);
  // The day a range grows from: a drag anchors on the day it began, a click on
  // the day it picked, and a shift-click on neither.
  const anchored = useRef<Date>(undefined);

  useEffect(() => {
    if (!from) {
      return undefined;
    }
    function finish(): void {
      if (from && to && !isSameDay(from, to)) {
        dragged.current = true;
        anchored.current = from;
        const { start, end } = sortEnds(from, to);
        onSelectRange?.(start, end);
      }
      setFrom(undefined);
      setTo(undefined);
    }
    // A drag the browser takes over, to scroll or to hand to another gesture,
    // never reaches a day to ask for.
    function abandon(): void {
      setFrom(undefined);
      setTo(undefined);
    }
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abandon);
    return () => {
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abandon);
    };
  }, [from, to, onSelectRange]);

  return {
    range: from && to ? sortEnds(from, to) : undefined,
    begin(date: Date): void {
      dragged.current = false;
      if (onSelectRange) {
        setFrom(date);
        setTo(date);
      }
    },
    extend(date: Date): void {
      if (from) {
        setTo(date);
      }
    },
    consumeClick(): boolean {
      const wasDrag = dragged.current;
      dragged.current = false;
      return wasDrag;
    },
    anchor(): Date | undefined {
      return anchored.current;
    },
    anchorOn(date: Date): void {
      anchored.current = date;
    },
  };
}
