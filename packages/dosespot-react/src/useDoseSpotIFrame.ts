// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { EPrescribingIFrameOptions } from '@medplum/react-hooks';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useRef, useState } from 'react';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT, DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';
import type { DoseSpotSelfEnrollmentResult } from './useDoseSpotSelfEnrollment';

export interface DoseSpotIFrameOptions extends EPrescribingIFrameOptions {
  /**
   * When true, automatically runs the self-enrollment bot before loading
   * the iframe if the current user does not have a DoseSpot identifier
   * on their ProjectMembership. Requires an active PractitionerRole with
   * DoseSpot role type codes for the practitioner.
   */
  readonly selfEnroll?: boolean;
  /** Called after self-enrollment completes successfully. */
  readonly onSelfEnrollSuccess?: (result: DoseSpotSelfEnrollmentResult) => void;
}

/**
 * React hook that syncs a patient to DoseSpot and returns the iframe URL.
 *
 * Runs optional self-enrollment, then the patient-sync bot (when `patientId`
 * is set), then the iframe bot — aligned with {@link useEPrescribingIFrame}
 * behavior plus DoseSpot-specific enrollment.
 *
 * @param options - Configuration and callback options.
 * @returns The DoseSpot iframe URL, or undefined while loading.
 */
export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId, selfEnroll, onPatientSyncSuccess, onIframeSuccess, onSelfEnrollSuccess, onError } = options;
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  const onIframeSuccessRef = useRef(onIframeSuccess);
  const onSelfEnrollSuccessRef = useRef(onSelfEnrollSuccess);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onPatientSyncSuccessRef.current = onPatientSyncSuccess;
    onIframeSuccessRef.current = onIframeSuccess;
    onSelfEnrollSuccessRef.current = onSelfEnrollSuccess;
    onErrorRef.current = onError;
  }, [onPatientSyncSuccess, onIframeSuccess, onSelfEnrollSuccess, onError]);

  useEffect(() => {
    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        if (selfEnroll && !hasDoseSpotIdentifier(medplum)) {
          const enrollResult = (await medplum.executeBot(
            DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT,
            {}
          )) as DoseSpotSelfEnrollmentResult;
          if (cancelled) {
            return;
          }
          onSelfEnrollSuccessRef.current?.(enrollResult);
        }

        if (patientId) {
          await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId });
          if (cancelled) {
            return;
          }
          onPatientSyncSuccessRef.current?.();
        }
        const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId });
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
  }, [medplum, patientId, selfEnroll]);

  return iframeUrl;
}

/**
 * Checks whether the current user's ProjectMembership has a DoseSpot identifier.
 *
 * @param medplum - Medplum client for the active session.
 * @returns True when membership identifiers include a DoseSpot system URL.
 */
function hasDoseSpotIdentifier(medplum: ReturnType<typeof useMedplum>): boolean {
  return !!medplum.getProjectMembership()?.identifier?.some((i) => i.system?.includes('dosespot'));
}
