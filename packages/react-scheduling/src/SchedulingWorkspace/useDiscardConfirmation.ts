// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useState } from 'react';

export interface DiscardConfirmation {
  readonly onBookingDirtyChange: (dirty: boolean) => void;
  readonly onBlockDirtyChange: (dirty: boolean) => void;
  /** Runs `proceed` at once when nothing would be lost, otherwise once the viewer confirms. */
  readonly guard: (proceed: () => void) => void;
  /** Forgets what the forms reported, for a pane that has closed. */
  readonly reset: () => void;
  readonly modalProps: { readonly opened: boolean; readonly onCancel: () => void; readonly onConfirm: () => void };
}

/**
 * Asks before something opened from the calendar replaces a booking pane holding unsaved answers.
 *
 * Both tabs stay mounted and both go when the pane closes, so either one holding answers counts.
 *
 * @returns What each form reports through, the guard, and the props for the dialog that asks.
 */
export function useDiscardConfirmation(): DiscardConfirmation {
  const [bookingDirty, setBookingDirty] = useState(false);
  const [blockDirty, setBlockDirty] = useState(false);
  const [pending, setPending] = useState<() => void>();
  const dirty = bookingDirty || blockDirty;

  const guard = useCallback(
    (proceed: () => void): void => {
      if (dirty) {
        setPending(() => proceed);
      } else {
        proceed();
      }
    },
    [dirty]
  );

  const reset = useCallback((): void => {
    setBookingDirty(false);
    setBlockDirty(false);
  }, []);

  return {
    onBookingDirtyChange: setBookingDirty,
    onBlockDirtyChange: setBlockDirty,
    guard,
    reset,
    modalProps: {
      opened: pending !== undefined,
      onCancel: () => setPending(undefined),
      onConfirm: () => {
        setPending(undefined);
        pending?.();
      },
    },
  };
}
