// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MouseEvent } from 'react';
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** The availability block the pointer is over, and the minute of it the pointer is at. */
export interface AvailabilityShadeHoverTarget {
  readonly id: string;
  /** In milliseconds, to the minute, so that moving within a minute changes nothing. */
  readonly at?: number;
}

/** What the pointer is over, for the block to open its tooltip by and say what holds at that time. */
export const AvailabilityShadeHoverContext = createContext<AvailabilityShadeHoverTarget | undefined>(undefined);

const MINUTE_MS = 60 * 1000;

// The attributes `AvailabilityShadeEvent` names its block by, and says when it starts and ends in.
const SHADE_ID_ATTRIBUTE = 'data-shade-id';
const SHADE_START_ATTRIBUTE = 'data-shade-start';
const SHADE_END_ATTRIBUTE = 'data-shade-end';

// The instant a block is showing at a height on screen: the block runs evenly from its start at its top
// edge to its end at its bottom edge, whatever the grid's rows are.
function instantAt(block: Element, clientY: number): Date | undefined {
  const start = Number(block.getAttribute(SHADE_START_ATTRIBUTE));
  const end = Number(block.getAttribute(SHADE_END_ATTRIBUTE));
  const rect = block.getBoundingClientRect();
  if (!start || !end || rect.height <= 0) {
    return undefined;
  }
  const share = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
  return new Date(start + share * (end - start));
}

// The classes `CalendarBase` gives the events it draws in front of the blocks.
const FOREGROUND_EVENT_SELECTOR = '.appointment, .slot';

export interface AvailabilityShadeHover {
  /** The block under the pointer, with no event in front of it there. */
  readonly hovered: AvailabilityShadeHoverTarget | undefined;
  /** Spread onto the element wrapping the calendar. Empty while there are no blocks to track. */
  readonly hoverProps: {
    readonly onMouseMove?: (event: MouseEvent) => void;
    readonly onMouseLeave?: () => void;
  };
}

/**
 * Tracks which availability block the pointer is over.
 *
 * FullCalendar lays the list its events sit in over the whole of a day's column, in front of the
 * background events, so a block never hears the pointer itself. This asks the document what is under the
 * pointer instead, and stops at an event drawn in front of the block.
 * @param enabled - Whether there are blocks to track.
 * @param onHoverInstant - Called on each move with the instant under the pointer, to the pixel rather
 * than to the grid's rows, and the id of the block it is in, and with undefined once the pointer is off
 * the blocks.
 * @returns The hovered block, and the handlers that keep it current.
 */
export function useAvailabilityShadeHover(
  enabled: boolean,
  onHoverInstant?: (instant: Date | undefined, shadeId?: string) => void
): AvailabilityShadeHover {
  const [hoveredId, setHoveredId] = useState<string>();
  const [hoveredMinute, setHoveredMinute] = useState<number>();
  const latestOnHoverInstant = useRef(onHoverInstant);
  useEffect(() => {
    latestOnHoverInstant.current = onHoverInstant;
  }, [onHoverInstant]);

  const onMouseMove = useCallback((event: MouseEvent): void => {
    // jsdom has no `elementsFromPoint`.
    const under = document.elementsFromPoint?.(event.clientX, event.clientY) ?? [];
    let id: string | undefined;
    let instant: Date | undefined;
    for (const element of under) {
      if (element.closest(FOREGROUND_EVENT_SELECTOR)) {
        break;
      }
      const shadeId = element.getAttribute(SHADE_ID_ATTRIBUTE);
      if (shadeId) {
        id = shadeId;
        instant = instantAt(element, event.clientY);
        break;
      }
    }
    setHoveredId(id);
    setHoveredMinute(instant && Math.floor(instant.getTime() / MINUTE_MS) * MINUTE_MS);
    latestOnHoverInstant.current?.(instant, instant && id);
  }, []);

  const onMouseLeave = useCallback((): void => {
    setHoveredId(undefined);
    setHoveredMinute(undefined);
    latestOnHoverInstant.current?.(undefined);
  }, []);

  const hovered = useMemo(
    () => (enabled && hoveredId ? { id: hoveredId, at: hoveredMinute } : undefined),
    [enabled, hoveredId, hoveredMinute]
  );
  return { hovered, hoverProps: enabled ? { onMouseMove, onMouseLeave } : {} };
}
