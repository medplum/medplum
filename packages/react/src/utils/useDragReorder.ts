// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PointerEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Pointer drag state for reordering a vertical list.
 * `dragIndex` is the row being dragged and `overIndex` the row currently under the pointer; both
 * are undefined while idle. Call `startDrag` from a row's grip `onPointerDown` and `hover` from
 * every row's `onPointerMove`.
 */
export interface DragReorder {
  readonly dragIndex: number | undefined;
  readonly overIndex: number | undefined;
  readonly startDrag: (e: PointerEvent<HTMLElement>, index: number) => void;
  readonly hover: (index: number) => void;
}

/**
 * Tracks a pointer drag across list rows and reports the drop as `onReorder(from, to)`. The drag
 * ends on the next pointerup or pointercancel anywhere in the document, and the document listeners
 * are removed when the component unmounts mid-drag. The latest `onReorder` is always used, so a
 * callback that closes over fresh props is safe even when they change during the drag.
 * @param onReorder - Called with the dragged index and the drop index when they differ.
 * @returns The drag state and handlers to wire onto rows.
 */
export function useDragReorder(onReorder: (from: number, to: number) => void): DragReorder {
  const [dragIndex, setDragIndex] = useState<number | undefined>(undefined);
  const [overIndex, setOverIndex] = useState<number | undefined>(undefined);
  const dragIndexRef = useRef<number | undefined>(undefined);
  const overIndexRef = useRef<number | undefined>(undefined);
  const endDragRef = useRef<(() => void) | undefined>(undefined);
  const onReorderRef = useRef(onReorder);

  useEffect(() => {
    onReorderRef.current = onReorder;
  });

  useEffect(() => () => endDragRef.current?.(), []);

  function clearDrag(): void {
    setDragIndex(undefined);
    setOverIndex(undefined);
    dragIndexRef.current = undefined;
    overIndexRef.current = undefined;
  }

  function hover(index: number): void {
    if (dragIndexRef.current !== undefined && overIndexRef.current !== index) {
      overIndexRef.current = index;
      setOverIndex(index);
    }
  }

  function startDrag(e: PointerEvent<HTMLElement>, index: number): void {
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    endDragRef.current?.();
    dragIndexRef.current = index;
    overIndexRef.current = index;
    setDragIndex(index);
    const removeListeners = (): void => {
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerCancel);
      endDragRef.current = undefined;
    };
    const onPointerUp = (): void => {
      const from = dragIndexRef.current;
      const to = overIndexRef.current;
      removeListeners();
      if (from !== undefined && to !== undefined && from !== to) {
        onReorderRef.current(from, to);
      }
      clearDrag();
    };
    const onPointerCancel = (): void => {
      removeListeners();
      clearDrag();
    };
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerCancel);
    endDragRef.current = removeListeners;
  }

  return { dragIndex, overIndex, startDrag, hover };
}
