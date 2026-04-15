// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Container, Loader, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { OperationOutcome, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm } from '@medplum/react';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

function outcomeMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const oo = body as OperationOutcome;
  if (oo.resourceType !== 'OperationOutcome' || !Array.isArray(oo.issue)) {
    return undefined;
  }
  const first = oo.issue[0];
  const text =
    first?.diagnostics ||
    first?.details?.text ||
    (typeof first?.details?.coding?.[0]?.display === 'string' ? first.details.coding[0].display : undefined);
  return typeof text === 'string' ? text : undefined;
}

function submitErrorMessage(body: unknown, statusText: string): string {
  if (body && typeof body === 'object') {
    const o = body as { message?: string; error?: string };
    if (typeof o.message === 'string') {
      return o.message;
    }
    if (typeof o.error === 'string') {
      return o.error;
    }
  }
  return outcomeMessage(body) || statusText;
}

function responseBodyIsJson(contentType: string): boolean {
  return contentType.includes('application/json') || contentType.includes('fhir+json');
}

export function App(): ReactElement {
  const [initError, setInitError] = useState<string | undefined>();
  const [questionnaire, setQuestionnaire] = useState<Questionnaire | undefined>();

  const inviteToken = useMemo(
    () => new URLSearchParams(window.location.search).get('invite')?.trim() ?? '',
    []
  );

  useEffect(() => {
    let cancelled = false;

    if (!inviteToken) {
      return (): void => {
        cancelled = true;
      };
    }

    async function load(): Promise<void> {
      try {
        const loadResponse = await fetch('/api/medplum-questionnaire', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        });
        const contentType = loadResponse.headers.get('content-type') ?? '';
        const body = responseBodyIsJson(contentType)
          ? ((await loadResponse.json()) as unknown)
          : await loadResponse.text();

        if (!loadResponse.ok) {
          const message =
            typeof body === 'string'
              ? body || loadResponse.statusText
              : submitErrorMessage(body, loadResponse.statusText);
          throw new Error(message);
        }

        const data = body as { questionnaire?: Questionnaire };
        if (data.questionnaire?.resourceType !== 'Questionnaire') {
          throw new Error('Bot did not return a Questionnaire');
        }
        if (cancelled) {
          return;
        }
        setQuestionnaire(data.questionnaire);
      } catch (err: unknown) {
        if (!cancelled) {
          setInitError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    load().catch((err: unknown) => {
      if (!cancelled) {
        setInitError(err instanceof Error ? err.message : String(err));
      }
    });

    return (): void => {
      cancelled = true;
    };
  }, [inviteToken]);

  const handleSubmit = useCallback(
    async (response: QuestionnaireResponse) => {
      const token = new URLSearchParams(window.location.search).get('invite')?.trim() ?? '';
      if (!token) {
        notifications.show({
          title: 'Missing invite',
          message:
            'Add an invite token to the URL, for example: http://localhost:3010/?invite=YOUR_TASK_TOKEN',
          color: 'red',
        });
        return;
      }

      try {
        const submitResponse = await fetch('/api/medplum-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, response }),
        });
        const contentType = submitResponse.headers.get('content-type') ?? '';
        const body = responseBodyIsJson(contentType)
          ? ((await submitResponse.json()) as unknown)
          : await submitResponse.text();

        if (!submitResponse.ok) {
          const message =
            typeof body === 'string'
              ? body || submitResponse.statusText
              : submitErrorMessage(body, submitResponse.statusText);
          throw new Error(message);
        }

        const success = body as { questionnaireResponseId?: string };
        const idSuffix =
          typeof success?.questionnaireResponseId === 'string'
            ? ` (id: ${success.questionnaireResponseId})`
            : '';

        notifications.show({
          title: 'Submitted',
          message: `Your questionnaire response was saved via the Bot.${idSuffix}`,
          color: 'green',
        });
      } catch (err: unknown) {
        notifications.show({
          title: 'Submit failed',
          message: err instanceof Error ? err.message : String(err),
          color: 'red',
        });
      }
    },
    []
  );

  if (!inviteToken) {
    return (
      <Container size="sm" py="xl">
        <Alert title="Invite token required" color="yellow">
          <Text size="sm">
            This demo loads and submits through a Medplum Bot using your invite <Text span fw={700}>Task</Text>. Open
            the page with
            <Text span fw={700} component="span">
              {' '}
              ?invite=YOUR_TOKEN
            </Text>{' '}
            in the URL (the <Text span fw={700}>identifier.value</Text> on the invite Task). The invite Task must
            include <Text span fw={700}>focus</Text> pointing to your <Text span fw={700}>Questionnaire</Text> so the
            Bot can return it.
          </Text>
        </Alert>
      </Container>
    );
  }

  if (initError) {
    return (
      <Container size="sm" py="xl">
        <Alert title="Could not load form" color="red">
          <Text size="sm">{initError}</Text>
        </Alert>
      </Container>
    );
  }

  if (!questionnaire) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="md">
          <Loader />
          <Text c="dimmed">Loading questionnaire…</Text>
        </Stack>
      </Container>
    );
  }

  return (
    <Container size="md" py="xl">
      <Stack gap="lg">
        <QuestionnaireForm questionnaire={questionnaire} onSubmit={handleSubmit} />
      </Stack>
    </Container>
  );
}
