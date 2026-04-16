// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';

/**
 * Result returned by the DoseSpot self-enrollment bot.
 */
export interface DoseSpotSelfEnrollmentResult {
  status: 'created' | 'already_enrolled' | 'advanced';
  doseSpotClinicianId: number;
  registrationStatus: string;
  epcsEnabled: boolean;
  nextSteps: string[];
}

/**
 * Options for the {@link useDoseSpotSelfEnrollment} hook.
 */
export interface DoseSpotSelfEnrollmentOptions {
  /** Whether to run the self-enrollment bot. Defaults to true. */
  readonly enabled?: boolean;
  /** Called when enrollment succeeds. */
  readonly onSuccess?: (result: DoseSpotSelfEnrollmentResult) => void;
  /** Called when enrollment fails. */
  readonly onError?: (err: unknown) => void;
}

/**
 * React hook that executes the DoseSpot self-enrollment bot.
 *
 * Runs the `dosespot-self-enroll-prescriber-bot` once on mount (when enabled)
 * and returns the enrollment result, loading state, and any error.
 *
 * The bot is idempotent -- it creates the clinician on the first call and
 * auto-advances through registration stages (IDP, TFA) on subsequent calls.
 *
 * @param options - Configuration options.
 * @returns An object with `result`, `loading`, and `error` fields.
 */
export function useDoseSpotSelfEnrollment(options?: DoseSpotSelfEnrollmentOptions): {
  result: DoseSpotSelfEnrollmentResult | undefined;
  loading: boolean;
  error: unknown;
} {
  const medplum = useMedplum();
  const enabled = options?.enabled ?? true;
  const initializingRef = useRef(false);
  const [result, setResult] = useState<DoseSpotSelfEnrollmentResult | undefined>(undefined);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<unknown>(undefined);

  const onSuccessRef = useRef(options?.onSuccess);
  onSuccessRef.current = options?.onSuccess;

  const onErrorRef = useRef(options?.onError);
  onErrorRef.current = options?.onError;

  const enroll = useCallback(async () => {
    if (initializingRef.current || !enabled) {
      return;
    }

    initializingRef.current = true;
    setLoading(true);
    setError(undefined);

    try {
      const enrollResult = (await medplum.executeBot(
        DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT,
        {}
      )) as DoseSpotSelfEnrollmentResult;

      setResult(enrollResult);
      onSuccessRef.current?.(enrollResult);
    } catch (err: unknown) {
      setError(err);
      onErrorRef.current?.(err);
    } finally {
      setLoading(false);
    }
  }, [medplum, enabled]);

  useEffect(() => {
    enroll().catch(console.error);
  }, [enroll]);

  return { result, loading, error };
}
