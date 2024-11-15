import { Patient } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DOSESPOT_IFRAME_BOT, DOSESPOT_PATIENT_ID_SYSTEM, DOSESPOT_PATIENT_SYNC_BOT } from './common';

export interface DoseSpotIFrameOptions {
  readonly patientId?: string;
  readonly onPatientSyncSuccess?: () => void;
  readonly onPatientSyncError?: (err: unknown) => void;
  readonly onIframeSuccess?: (url: string) => void;
  readonly onIframeError?: (err: unknown) => void;
}

export function useDoseSpotIFrame(options: DoseSpotIFrameOptions): string | undefined {
  const medplum = useMedplum();
  const { patientId, onPatientSyncSuccess, onPatientSyncError, onIframeSuccess, onIframeError } = options;
  const patient = useResource<Patient>(patientId ? { reference: `Patient/${patientId}` } : undefined);
  const initializingRef = useRef<boolean>(false);
  const [iframeUrl, setIframeUrl] = useState<string | undefined>(undefined);

  const onPatientSyncSuccessRef = useRef(onPatientSyncSuccess);
  onPatientSyncSuccessRef.current = onPatientSyncSuccess;

  const onPatientSyncErrorRef = useRef(onPatientSyncError);
  onPatientSyncErrorRef.current = onPatientSyncError;

  const onIframeSuccessRef = useRef(onIframeSuccess);
  onIframeSuccessRef.current = onIframeSuccess;

  const onIframeErrorRef = useRef(onIframeError);
  onIframeErrorRef.current = onIframeError;

  const syncPatient = useCallback(async () => {
    try {
      await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, patient);
      onPatientSyncSuccessRef.current?.();
    } catch (err: unknown) {
      onPatientSyncErrorRef.current?.(err);
    }
  }, [medplum, patient]);

  const openIframe = useCallback(async () => {
    const doseSpotPatientId = patient?.identifier?.find((i) => i.system === DOSESPOT_PATIENT_ID_SYSTEM)?.value;
    try {
      const result = await medplum.executeBot(DOSESPOT_IFRAME_BOT, { patientId: doseSpotPatientId });
      if (result.url) {
        setIframeUrl(result.url);
        onIframeSuccessRef.current?.(result.url);
      }
    } catch (err: unknown) {
      onIframeErrorRef.current?.(err);
    }
  }, [medplum, patient]);

  const initPage = useCallback(async () => {
    if (!initializingRef.current) {
      initializingRef.current = true;
      if (patient) {
        await syncPatient();
      }
      await openIframe();
    }
  }, [patient, syncPatient, openIframe]);

  useEffect(() => {
    initPage().catch(console.error);
  }, [initPage]);

  return iframeUrl;
}
