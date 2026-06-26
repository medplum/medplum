// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Document, Loading, SignInForm, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { DEMO_TAG, createDemoPatients } from '../data/demoData';

type SetupStatus = 'init' | 'creating' | 'done' | 'error';

export function SetupPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus>('init');
  const [message, setMessage] = useState<string>();
  const hasRun = useRef(false);

  const runSetup = useCallback(async (): Promise<void> => {
    setStatus('creating');
    try {
      const existing = await medplum.searchResources('Patient', {
        _tag: `${DEMO_TAG.system}|${DEMO_TAG.code}`,
        _count: '1',
      });
      if (existing.length > 0) {
        setMessage('Demo data already exists in this project.');
      } else {
        await createDemoPatients(medplum);
        setMessage('10 demo patients created successfully.');
      }
      setStatus('done');
      // Sign out so the Setup session doesn't conflict with the SMART launch flow.
      // The SMART launch requires a fresh Medplum login with patient context.
      medplum.signOut().catch(console.error);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unknown error');
      setStatus('error');
    }
  }, [medplum]);

  useEffect(() => {
    if (medplum.isAuthenticated() && !hasRun.current) {
      hasRun.current = true;
      runSetup().catch(console.error);
    }
  }, [medplum, runSetup]);

  if (!medplum.isAuthenticated() && status === 'init') {
    return (
      <Document width={400} px="xl" py="xl" bdrs="md">
        <SignInForm
          chooseScopes
          onSuccess={() => runSetup().catch(console.error)}
          chooseScopeFormProps={{
            logo: <img src="/medplum-logo.svg" height={32} alt="" />,
            title: 'Grant Demo Setup Access',
            submitLabel: 'Connect',
            children: (
              <Text size="sm" c="dimmed" ta="center" mb="sm">
                This app needs access to your Medplum project to generate demo patient data.
              </Text>
            ),
          }}
        >
          <Text size="sm" c="dimmed" ta="center" mb="sm">
            Sign in to your Medplum project to set up demo data.
          </Text>
        </SignInForm>
      </Document>
    );
  }

  if (status === 'init' || status === 'creating') {
    return <Loading />;
  }

  if (status === 'done') {
    return (
      <Document>
        <Stack>
          <Title order={2}>Setup Complete</Title>
          <Text>{message}</Text>
          <Button onClick={() => navigate('/')}>Back to Home</Button>
        </Stack>
      </Document>
    );
  }

  return (
    <Document>
      <Stack>
        <Title order={2}>Setup Failed</Title>
        <Text c="red">{message}</Text>
        <Anchor onClick={() => navigate('/')}>← Back to Home</Anchor>
      </Stack>
    </Document>
  );
}
