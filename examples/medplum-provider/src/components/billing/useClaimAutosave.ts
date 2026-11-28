// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Claim } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { useCallback, useEffect, useRef } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { finishClaimEdit } from './claimEditing';

const SAVE_DELAY_MS = 600;

export interface ClaimAutosave {
  /** Queues an edited claim to save a moment after the last change. */
  readonly queue: (claim: WithId<Claim>) => void;
  /** Saves the queued claim now, e.g. before submitting it. */
  readonly flush: () => Promise<void>;
}

/**
 * Saves a claim's edits shortly after the last one, and any still queued when the component unmounts.
 * @param onSaved - Called after each save.
 * @returns The queue and flush functions.
 */
export function useClaimAutosave(onSaved: () => void): ClaimAutosave {
  const medplum = useMedplum();
  const pending = useRef<WithId<Claim> | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    const claim = pending.current;
    pending.current = undefined;
    if (claim) {
      await medplum.updateResource(finishClaimEdit(claim));
      onSaved();
    }
  }, [medplum, onSaved]);

  const queue = useCallback(
    (claim: WithId<Claim>): void => {
      pending.current = claim;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => flush().catch(showErrorNotification), SAVE_DELAY_MS);
    },
    [flush]
  );

  useEffect(
    () => () => {
      flush().catch(showErrorNotification);
    },
    [flush]
  );

  return { queue, flush };
}
