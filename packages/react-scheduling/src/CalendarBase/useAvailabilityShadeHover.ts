// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MouseEvent } from 'react';
import { createContext, useCallback, useState } from 'react';

/** The id of the availability block the pointer is over, for the block to open its tooltip by. */
export const AvailabilityShadeHoverContext = createContext<string | undefined>(undefined);

// The attribute `AvailabilityShadeEvent` names its block by.
const SHADE_ID_ATTRIBUTE = 'data-shade-id';

// The classes `CalendarBase` gives the events it draws in front of the blocks.
const FOREGROUND_EVENT_SELECTOR = '.appointment, .slot';

export interface AvailabilityShadeHover {
  /** The id of the block under the pointer, with no event in front of it there. */
  readonly hoveredId: string | undefined;
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
 * @returns The hovered block's id, and the handlers that keep it current.
 */
export function useAvailabilityShadeHover(enabled: boolean): AvailabilityShadeHover {
  const [hoveredId, setHoveredId] = useState<string>();

  const onMouseMove = useCallback((event: MouseEvent): void => {
    // jsdom has no `elementsFromPoint`.
    const under = document.elementsFromPoint?.(event.clientX, event.clientY) ?? [];
    let id: string | undefined;
    for (const element of under) {
      if (element.closest(FOREGROUND_EVENT_SELECTOR)) {
        break;
      }
      const shadeId = element.getAttribute(SHADE_ID_ATTRIBUTE);
      if (shadeId) {
        id = shadeId;
        break;
      }
    }
    setHoveredId(id);
  }, []);

  const onMouseLeave = useCallback((): void => setHoveredId(undefined), []);

  return { hoveredId: enabled ? hoveredId : undefined, hoverProps: enabled ? { onMouseMove, onMouseLeave } : {} };
}
