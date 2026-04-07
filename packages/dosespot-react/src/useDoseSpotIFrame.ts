// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT, DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';
import type { DoseSpotSelfEnrollmentResult } from './useDoseSpotSelfEnrollment';

export interface DoseSpotIFrameOptions {
  readonly patientId?: string;
  /**
   * When true, automatically runs the self-enrollment bot before loading
   * the iframe if the current user does not have a DoseSpot identifier
   * on their ProjectMembership. Requires an active PractitionerRole with
   * DoseSpot role type codes for the practitioner.
   */
  readonly selfEnroll?: boolean;
  /** Called after self-enrollment completes successfully. */
  readonly onSelfEnrollSuccess?: (result: DoseSpotSelfEnrollmentResult) => void;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId, selfEnroll, onPatientSyncSuccess, onIframeSuccess, onSelfEnrollSuccess, onError } = options;
  const initializingRef = useRef(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  onPatientSyncSuccessRef.current = onPatientSyncSuccess;

  const onIframeSuccessRef = useRef(onIframeSuccess);
  onIframeSuccessRef.current = onIframeSuccess;

  const onSelfEnrollSuccessRef = useRef(onSelfEnrollSuccess);
  onSelfEnrollSuccessRef.current = onSelfEnrollSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Reset when inputs change so we re-fetch the iframe URL
  useEffect(() => {
    initializingRef.current = false;
  }, [patientId]);

  const initPage = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    try {
      // Self-enroll if enabled and user doesn't have a DoseSpot identifier yet
      if (selfEnroll && !hasDoseSpotIdentifier(medplum)) {
        const enrollResult = (await medplum.executeBot(
          DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT,
          {}
        )) as DoseSpotSelfEnrollmentResult;
        onSelfEnrollSuccessRef.current?.(enrollResult);
      }

      if (patientId) {
        await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId });
        onPatientSyncSuccessRef.current?.();
      }
      const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId });
      if (result.url) {
        setIframeUrl(result.url);
        onIframeSuccessRef.current?.(result.url);
      }
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [medplum, patientId, selfEnroll]);

  useEffect(() => {
    initPage().catch(console.error);
  }, [initPage]);

  return iframeUrl;
}

/**
 * Checks whether the current user's ProjectMembership has a DoseSpot identifier.
 */
function hasDoseSpotIdentifier(medplum: ReturnType<typeof useMedplum>): boolean {
  return !!medplum.getProjectMembership()?.identifier?.some((i) => i.system?.includes('dosespot'));
}
