// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import type {
  Communication,
  Organization,
  Patient,
  Practitioner,
  PractitionerRole,
  Reference,
} from '@medplum/fhirtypes';
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';

const TWILIO_OPERATION_URL = 'https://medplum.com/fhir/OperationDefinition/send-sms-twilio';

const SMSWRIT_MEDIUM: Communication['medium'] = [
  {
    coding: [
      {
        system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationMode',
        code: 'SMSWRIT',
        display: 'SMS Written',
      },
    ],
  },
];

export type TwilioSmsSender = Practitioner | Organization | PractitionerRole;

export interface UseTwilioSmsOptions {
  patient: Patient;
  sender?: Reference<TwilioSmsSender>;
  /** Reference to the current thread header. If provided, the SMS Communication will be stored as a child of this thread. */
  threadRef?: Reference<Communication>;
}

export interface UseTwilioSmsReturn {
  sendSms: (message: string) => Promise<void>;
  sending: boolean;
  error: Error | undefined;
  twilioAvailable: boolean;
  patientHasPhone: boolean;
}

/**
 * Hook for sending outbound SMS messages via the `$send-sms-twilio` FHIR operation.
 *
 * `twilioAvailable` controls whether the SMS option should be shown in the UI at all.
 * `patientHasPhone` controls whether the send button should be enabled once the UI is visible.
 * Delivery status is tracked per-message via the caller's subscription (e.g. BaseChat's thread subscription).
 *
 * @param options - Hook options.
 * @param options.patient - Patient to send the SMS to.
 * @param options.sender - Optional reference to the sender (Practitioner, Organization, or PractitionerRole).
 * @param options.threadRef - Optional thread reference for associating the SMS with an existing thread.
 * @returns Send function, loading/error state, and availability flags.
 */
export function useTwilioSms({ patient, sender, threadRef }: UseTwilioSmsOptions): UseTwilioSmsReturn {
  const medplum = useMedplum();
  const [twilioAvailable, setTwilioAvailable] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | undefined>();

  const patientHasPhone = patient.telecom?.some((t) => t.system === 'phone' && t.value) ?? false;

  useEffect(() => {
    medplum
      .searchOne('OperationDefinition', { url: TWILIO_OPERATION_URL })
      .then((result) => setTwilioAvailable(!!result))
      .catch(() => setTwilioAvailable(false));
  }, [medplum]);

  const sendSms = useCallback(
    async (message: string): Promise<void> => {
      setSending(true);
      setError(undefined);
      try {
        const communication: Communication = {
          resourceType: 'Communication',
          status: 'preparation',
          medium: SMSWRIT_MEDIUM,
          subject: createReference(patient),
          recipient: [createReference(patient)],
          ...(sender ? { sender } : {}),
          ...(threadRef ? { partOf: [threadRef] } : {}),
          payload: [{ contentString: message }],
        };

        await medplum.post<Communication>(medplum.fhirUrl('Communication', '$send-sms-twilio'), communication);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setSending(false);
      }
    },
    [medplum, patient, sender, threadRef]
  );

  return { sendSms, sending, error, twilioAvailable, patientHasPhone };
}
