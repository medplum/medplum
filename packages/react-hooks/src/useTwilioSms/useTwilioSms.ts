// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createReference } from '@medplum/core';
import type { Bundle, Communication, Organization, Patient, Practitioner, PractitionerRole, Reference } from '@medplum/fhirtypes';
import { useCallback, useEffect, useState } from 'react';
import { useMedplum } from '../MedplumProvider/MedplumProvider.context';
import { useSubscription } from '../useSubscription/useSubscription';

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
}

export interface UseTwilioSmsReturn {
  sendSms: (message: string) => Promise<void>;
  sending: boolean;
  error: Error | undefined;
  deliveryStatus: Communication['status'] | undefined;
  twilioAvailable: boolean;
  patientHasPhone: boolean;
}

/**
 * Hook for sending outbound SMS messages via the `$send-sms-twilio` FHIR operation.
 *
 * Checks whether the Twilio OperationDefinition is deployed in the current project and
 * tracks real-time delivery status on the last sent Communication via WebSocket subscription.
 *
 * `twilioAvailable` controls whether the SMS option should be shown in the UI at all.
 * `patientHasPhone` controls whether the send button should be enabled once the UI is visible.
 *
 * @param options - Patient to send to, and optional explicit sender reference. If `sender` is omitted, the bot resolves it from the invoking user's profile.
 * @returns Send function, loading/error state, delivery status, and availability flags.
 */
export function useTwilioSms({ patient, sender }: UseTwilioSmsOptions): UseTwilioSmsReturn {
  const medplum = useMedplum();
  const [twilioAvailable, setTwilioAvailable] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<Error | undefined>();
  // Tracks only the most recently sent message. Sending a second message replaces this,
  // so delivery status reflects the last send only.
  const [lastMessage, setLastMessage] = useState<Communication | undefined>();

  const patientHasPhone = patient.telecom?.some((t) => t.system === 'phone' && t.value) ?? false;

  useEffect(() => {
    medplum
      .searchOne('OperationDefinition', { url: TWILIO_OPERATION_URL })
      .then((result) => setTwilioAvailable(!!result))
      .catch(() => setTwilioAvailable(false));
  }, [medplum]);

  useSubscription(
    lastMessage?.id ? `Communication?_id=${lastMessage.id}` : undefined,
    (bundle: Bundle) => {
      const updated = bundle.entry
        ?.map((e) => e.resource)
        .find((r): r is Communication => r?.resourceType === 'Communication');
      if (updated) {
        setLastMessage(updated);
      }
    }
  );

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
          payload: [{ contentString: message }],
        };

        const result = await medplum.post<Communication>(
          medplum.fhirUrl('Communication', '$send-sms-twilio'),
          communication
        );

        setLastMessage(result);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
        throw err;
      } finally {
        setSending(false);
      }
    },
    [medplum, patient, sender]
  );

  return {
    sendSms,
    sending,
    error,
    deliveryStatus: lastMessage?.status,
    twilioAvailable,
    patientHasPhone,
  };
}
