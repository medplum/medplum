// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT } from './common';

export interface DoseSpotIFrameOptions {
  readonly patientId?: string;
  readonly favorites?: boolean;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId, favorites, onPatientSyncSuccess, onIframeSuccess, onError } = options;
  const initializingRef = useRef<boolean>(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  onPatientSyncSuccessRef.current = onPatientSyncSuccess;

  const onIframeSuccessRef = useRef(onIframeSuccess);
  onIframeSuccessRef.current = onIframeSuccess;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Reset when inputs change so we re-fetch the iframe URL
  useEffect(() => {
    initializingRef.current = false;
  }, [patientId, favorites]);

  const initPage = useCallback(async () => {
    if (initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    try {
      if (patientId) {
        await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId });
        onPatientSyncSuccessRef.current?.();
      }
      const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId, favorites });
      if (result.url) {
        setIframeUrl(result.url);
        onIframeSuccessRef.current?.(result.url);
      }
    } catch (err: unknown) {
      onErrorRef.current?.(err);
    }
  }, [medplum, patientId, favorites]);

  useEffect(() => {
    initPage().catch(console.error);
  }, [initPage]);

  return iframeUrl;
}
