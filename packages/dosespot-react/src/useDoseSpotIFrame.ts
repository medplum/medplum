// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NOOP } from '@medplum/core';
import { useMedplum } from '@medplum/react-hooks';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_SYNC_BOT } from './common';

export interface DoseSpotIFrameOptions {
  readonly patientId?: string;
  readonly onPatientSyncSuccess?: () => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onError?: (err: unknown) => void;
}

export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId } = options;
  const initializingRef = useRef(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);
  const onPatientSyncSuccess = useEffectEvent(options.onPatientSyncSuccess ?? NOOP);
  const onIframeSuccess = useEffectEvent(options.onIframeSuccess ?? NOOP);
  const onError = useEffectEvent(options.onError ?? NOOP);

  useEffect(() => {
    const initPage = async (): Promise<void> => {
      if (initializingRef.current) {
        return;
      }
      initializingRef.current = true;
      try {
        if (patientId) {
          await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, { patientId });
          onPatientSyncSuccess();
        }
        const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId });
        if (result.url) {
          setIframeUrl(result.url);
          onIframeSuccess(result.url);
        }
      } catch (err: unknown) {
        onError(err);
      } finally {
        initializingRef.current = false;
      }
    };

    initPage().catch(console.error);
  }, [medplum, patientId]);

  return iframeUrl;
}
