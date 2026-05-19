// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Stack, Text, Title } from '@mantine/core';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { Document, Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';

type PageState = 'loading' | 'ready' | 'submitted' | 'error';

export function QuestionnairePage(): JSX.Element {
  const medplum = useMedplum();
  const [searchParams] = useSearchParams();
  const [pageState, setPageState] = useState<PageState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>();
  const [patient, setPatient] = useState<Patient>();

  useEffect(() => {
    const code = searchParams.get('code');
    const clientId = searchParams.get('clientId');
    const questionnaireId = searchParams.get('questionnaireId');
    const patientId = searchParams.get('patientId');

    if (!code || !clientId || !questionnaireId || !patientId) {
      setErrorMessage('Invalid or incomplete magic link. Please request a new one.');
      setPageState('error');
      return;
    }

    // Redeem the pre-authorized code and load the questionnaire and patient
    async function redeemAndLoad(): Promise<void> {
      const tokenRes = await fetch(`${medplum.getBaseUrl()}oauth2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
          client_id: clientId as string,
          'pre-authorized_code': code as string,
        }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        const description = (body as { error_description?: string }).error_description;
        throw new Error(description ?? 'This link has expired or has already been used.');
      }

      const tokens = (await tokenRes.json()) as { access_token: string };
      medplum.setAccessToken(tokens.access_token);

      const [loadedQuestionnaire, loadedPatient] = await Promise.all([
        medplum.readResource('Questionnaire', questionnaireId as string),
        medplum.readResource('Patient', patientId as string),
      ]);

      setQuestionnaire(loadedQuestionnaire);
      setPatient(loadedPatient);
      setPageState('ready');
    }

    redeemAndLoad().catch((err) => {
      setErrorMessage(normalizeErrorString(err));
      setPageState('error');
    });
  }, [medplum, searchParams]);

  async function handleSubmit(response: QuestionnaireResponse): Promise<void> {
    await medplum.createResource<QuestionnaireResponse>({
      ...response,
      subject: patient ? createReference(patient) : undefined,
    });
    setPageState('submitted');
  }

  if (pageState === 'loading') {
    return (
      <Document width={600}>
        <Loading />
      </Document>
    );
  }

  if (pageState === 'error') {
    return (
      <Document width={600}>
        <Alert icon={<IconAlertCircle size={16} />} title="Unable to load questionnaire" color="red">
          {errorMessage}
        </Alert>
      </Document>
    );
  }

  if (pageState === 'submitted') {
    return (
      <Document width={600}>
        <Stack align="center" gap="md">
          <IconCircleCheck size={48} color="var(--mantine-color-green-6)" />
          <Title order={3}>Thank you!</Title>
          <Text ta="center" c="dimmed">
            Your responses have been submitted successfully.
          </Text>
        </Stack>
      </Document>
    );
  }

  if (!questionnaire) {
    return (
      <Document width={600}>
        <Loading />
      </Document>
    );
  }

  return (
    <Document width={700}>
      <QuestionnaireForm
        questionnaire={questionnaire}
        subject={patient ? createReference(patient) : undefined}
        onSubmit={(response) => handleSubmit(response).catch(console.error)}
      />
    </Document>
  );
}
