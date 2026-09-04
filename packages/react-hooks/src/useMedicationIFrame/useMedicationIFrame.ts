// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { resolveId } from '@medplum/core';
import type { Identifier, Organization, Reference } from '@medplum/fhirtypes';
import { useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useStabilizedCallback } from '../useStabilizedCallback/useStabilizedCallback';

export interface MedicationIFrameOptions {
  readonly patientId?: string;
  /** Selected practice location for multi-practice deployments. */
  readonly organization?: Reference<Organization>;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

/**
 * Generic React hook that syncs a patient to a medication-order vendor and
 * returns the chart iframe URL.
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
 * @returns The medication-order iframe URL, or undefined while loading.
 */
export function useMedicationIFrame(
  syncBotIdentifier: Identifier,
  iframeBotIdentifier: Identifier,
  options: MedicationIFrameOptions
): string | undefined {
  const medplum = useMedplum();
  const { patientId, organization } = options;
  const organizationId = resolveId(organization);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccess = useStabilizedCallback(options.onPatientSyncSuccess);
  const onIframeSuccess = useStabilizedCallback(options.onIframeSuccess);
  const onError = useStabilizedCallback(options.onError);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        if (patientId) {
          await medplum.executeBot(syncBotIdentifier, { patientId, organizationId });
          if (cancelled) {
            return;
          }
          onPatientSyncSuccess();
        }
        const result = await medplum.executeBot(iframeBotIdentifier, { patientId, organizationId });
        if (cancelled) {
          return;
        }
        if (result.url) {
          setIframeUrl(result.url);
          onIframeSuccess(result.url);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          onError(err);
        }
      }
    };

    run().catch(() => {
      // Already reported via onError when !cancelled
    });

    return (): void => {
      cancelled = true;
    };
  }, [
    medplum,
    syncBotIdentifier,
    iframeBotIdentifier,
    patientId,
    organizationId,
    onPatientSyncSuccess,
    onIframeSuccess,
    onError,
  ]);

  return iframeUrl;
}
