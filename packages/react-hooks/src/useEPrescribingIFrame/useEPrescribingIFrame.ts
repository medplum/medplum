// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Identifier } from '@medplum/fhirtypes';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useEffect, useRef, useState } from 'react';

export interface EPrescribingIFrameOptions {
  readonly patientId?: string;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

/**
 * Generic React hook that syncs a patient to an e-prescribing system and
 * returns the iframe URL.
 *
 * Executes the patient-sync bot first (if patientId is provided), then
 * the iframe bot to obtain the prescribing UI URL.
 *
 * Uses an effect cleanup flag so React 18 Strict Mode double-mount does not
 * trigger duplicate bot executions.
 *
 * @param syncBotIdentifier - Bot identifier for the patient sync bot.
 * @param iframeBotIdentifier - Bot identifier for the iframe URL bot.
 * @param options - Configuration and callback options.
 * @returns The e-prescribing iframe URL, or undefined while loading.
 */
export function useEPrescribingIFrame(
  syncBotIdentifier: Identifier,
  iframeBotIdentifier: Identifier,
  options: EPrescribingIFrameOptions
): string | undefined {
  const medplum = useMedplum();
  const { patientId, onPatientSyncSuccess, onIframeSuccess, onError } = options;
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  const onIframeSuccessRef = useRef(onIframeSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onPatientSyncSuccessRef.current = onPatientSyncSuccess;
    onIframeSuccessRef.current = onIframeSuccess;
    onErrorRef.current = onError;
  }, [onPatientSyncSuccess, onIframeSuccess, onError]);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        if (patientId) {
          await medplum.executeBot(syncBotIdentifier, { patientId });
          if (cancelled) {
            return;
          }
          onPatientSyncSuccessRef.current?.();
        }
        const result = await medplum.executeBot(iframeBotIdentifier, { patientId });
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
    };

    run().catch(() => {
      // Handled via onErrorRef when !cancelled
    });

    return (): void => {
      cancelled = true;
    };
  }, [medplum, syncBotIdentifier, iframeBotIdentifier, patientId]);

  return iframeUrl;
}
