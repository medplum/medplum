// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useState } from 'react';
import type { DiscardGuard } from '../hooks/useDiscardGuard';
import { useDiscardGuard } from '../hooks/useDiscardGuard';

export interface BookingPaneGuard extends DiscardGuard {
  readonly onBookingDirtyChange: (dirty: boolean) => void;
  readonly onBlockDirtyChange: (dirty: boolean) => void;
  /** Forgets what the forms reported, and any action waiting on them, for a pane that has closed. */
  readonly reset: () => void;
}

/**
 * Asks before something opened from the calendar replaces a booking pane holding unsaved answers.
 *
 * Both tabs stay mounted and both go when the pane closes, so either one holding answers counts.
 *
 * @returns What each form reports through, the guard, and the props for the dialog that asks.
 */
export function useBookingPaneGuard(): BookingPaneGuard {
  const [bookingDirty, setBookingDirty] = useState(false);
  const [blockDirty, setBlockDirty] = useState(false);
  const discard = useDiscardGuard(bookingDirty || blockDirty);
  const { cancel } = discard;

  const reset = useCallback((): void => {
    setBookingDirty(false);
    setBlockDirty(false);
    cancel();
  }, [cancel]);

  return { ...discard, onBookingDirtyChange: setBookingDirty, onBlockDirtyChange: setBlockDirty, reset };
}
