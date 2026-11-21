// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useCallback, useState } from 'react';

export interface DiscardGuard {
  /** Runs `proceed` at once when nothing would be lost, otherwise once the viewer confirms. */
  readonly guard: (proceed: () => void) => void;
  /** Drops an action waiting on the viewer, for when what it would discard has gone. */
  readonly cancel: () => void;
  readonly modalProps: { readonly opened: boolean; readonly onCancel: () => void; readonly onConfirm: () => void };
}

/**
 * Holds back an action that would discard unsaved changes until the viewer confirms it.
 * Render a `DiscardChangesModal` with `modalProps` to ask.
 *
 * @param dirty - Whether there are unsaved changes the action would discard.
 * @returns The guard, a way to drop what it is holding, and the props for the dialog that asks.
 */
export function useDiscardGuard(dirty: boolean): DiscardGuard {
  const [pending, setPending] = useState<() => void>();

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

  const cancel = useCallback((): void => setPending(undefined), []);

  return {
    guard,
    cancel,
    modalProps: {
      opened: pending !== undefined,
      onCancel: cancel,
      onConfirm: () => {
        setPending(undefined);
        pending?.();
      },
    },
  };
}
