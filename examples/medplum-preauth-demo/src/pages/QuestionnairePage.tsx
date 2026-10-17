// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { ClientStorage, createReference, MedplumClient, MemoryStorage, normalizeErrorString } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Loading, MedplumProvider, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import { PatientPageLayout } from '../components/PatientPageLayout';

interface SigningSession {
  /** Signed in as the patient */
  medplum: MedplumClient;
  questionnaire: Questionnaire;
  patient: Patient;
}

// A pre-authorized code is single-use, so share one redemption per code across effect re-runs (StrictMode, remounts)
const sessions = new Map<string, Promise<SigningSession>>();

// Redeem the pre-authorized code, then load the questionnaire and patient with the resulting token
async function redeemAndLoad(
  baseUrl: string,
  code: string,
  clientId: string,
  questionnaireId: string,
  patientId: string
): Promise<SigningSession> {
  // The patient gets a separate client with in-memory storage under its own key prefix. If the link is opened in a
  // browser where a practitioner is signed in, the app's client already holds the practitioner's profile, which would
  // become the signer, and it reacts to the practitioner's login changes in other tabs.
  const medplum = new MedplumClient({ baseUrl, storage: new ClientStorage(new MemoryStorage(), 'patient:') });

  const tokenRes = await fetch(`${medplum.getBaseUrl()}oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      client_id: clientId,
      'pre-authorized_code': code,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error('This link has expired or has already been used.');
  }

  const tokens = await tokenRes.json();
  medplum.setAccessToken(tokens.access_token);
  // Load the profile so the signature's `who` is the patient
  await medplum.getProfileAsync();

  const [questionnaire, patient] = await Promise.all([
    medplum.readResource('Questionnaire', questionnaireId),
    medplum.readResource('Patient', patientId),
  ]);
  return { medplum, questionnaire, patient };
}

export function QuestionnairePage(): JSX.Element {
  const baseUrl = useMedplum().getBaseUrl();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<SigningSession>();
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);

  const code = searchParams.get('code');
  const clientId = searchParams.get('clientId');
  const questionnaireId = searchParams.get('questionnaireId');
  const patientId = searchParams.get('patientId');
  const linkError = code && clientId && questionnaireId && patientId ? error : 'Invalid or incomplete magic link.';

  useEffect(() => {
    if (!code || !clientId || !questionnaireId || !patientId) {
      return;
    }
    let load = sessions.get(code);
    if (!load) {
      load = redeemAndLoad(baseUrl, code, clientId, questionnaireId, patientId);
      sessions.set(code, load);
    }
    load.then(setSession).catch((err) => setError(normalizeErrorString(err)));
  }, [baseUrl, code, clientId, questionnaireId, patientId]);

  if (linkError) {
    return (
      <PatientPageLayout>
        <Alert icon={<IconAlertCircle size={16} />} title="Unable to load document" color="red">
          {linkError} Please request a new link.
        </Alert>
      </PatientPageLayout>
    );
  }

  if (!session) {
    return (
      <PatientPageLayout>
        <Loading />
      </PatientPageLayout>
    );
  }

  const { medplum, questionnaire, patient } = session;
  const firstName = patient.name?.[0]?.given?.[0];

  if (submitted) {
    return (
      <PatientPageLayout>
        <Stack align="center" gap="md" py="md">
          <IconCircleCheck size={56} color="var(--mantine-color-green-6)" />
          <Title order={3}>Document signed</Title>
          <Text ta="center" c="dimmed">
            Thank you{firstName && `, ${firstName}`}. Your signed consent forms have been submitted, and you can now
            close this window.
          </Text>
        </Stack>
      </PatientPageLayout>
    );
  }

  async function handleSubmit(response: QuestionnaireResponse): Promise<void> {
    try {
      await medplum.createResource(response);
      setSubmitted(true);
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }

  return (
    <PatientPageLayout
      width={800}
      hero={
        <Stack gap="xs">
          <Title order={1} fz={{ base: 28, sm: 40 }} fw={600} lh={1.2}>
            Review and{' '}
            <Text span inherit c="teal.8">
              sign
            </Text>{' '}
            your consent forms
          </Title>
          <Text c="dimmed" size="lg">
            Hi{firstName && ` ${firstName}`}, please review the forms below. Each agreement must be accepted, and your
            signature is required to submit.
          </Text>
        </Stack>
      }
    >
      {/* The form and SignatureInput use the patient's client, so the signature's `who` is the patient */}
      <MedplumProvider medplum={medplum}>
        <QuestionnaireForm
          questionnaire={questionnaire}
          subject={createReference(patient)}
          submitButtonText="Sign and submit"
          onSubmit={(response) => handleSubmit(response).catch(console.error)}
        />
      </MedplumProvider>
    </PatientPageLayout>
  );
}
