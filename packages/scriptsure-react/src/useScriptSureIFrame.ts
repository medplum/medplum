// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useRef, useState } from 'react';
import { SCRIPTSURE_IFRAME_BOT, SCRIPTSURE_PATIENT_SYNC_BOT } from './common';

export interface ScriptSureIFrameOptions {
  readonly patientId?: string;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

/**
 * React hook that syncs a patient to ScriptSure and returns the iframe URL.
 *
 * Executes the patient-sync bot first (if patientId is provided), then
 * the iframe bot to obtain the prescribing UI URL.
 *
 * Uses an effect cleanup flag so React 18 Strict Mode double-mount does not
 * trigger duplicate bot executions.
 *
 * @param options - Configuration and callback options.
 * @returns The ScriptSure iframe URL, or undefined while loading.
 */
export function useScriptSureIFrame(options: ScriptSureIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId, onPatientSyncSuccess, onIframeSuccess, onError } = options;
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  onPatientSyncSuccessRef.current = onPatientSyncSuccess;

  const onIframeSuccessRef = useRef(onIframeSuccess);
  onIframeSuccessRef.current = onIframeSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;

    (async (): Promise<void> => {
      try {
        if (patientId) {
          await medplum.executeBot(SCRIPTSURE_PATIENT_SYNC_BOT, { patientId });
          if (cancelled) {
            return;
          }
          onPatientSyncSuccessRef.current?.();
        }
        const result = await medplum.executeBot(SCRIPTSURE_IFRAME_BOT, { patientId });
        if (cancelled) {
          return;
        }
        if (result.url) {
          setIframeUrl(result.url);
          onIframeSuccessRef.current?.(result.url);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          onErrorRef.current?.(err);
        }
      }
    })();

    return (): void => {
      cancelled = true;
    };
  }, [medplum, patientId]);

  return iframeUrl;
}
