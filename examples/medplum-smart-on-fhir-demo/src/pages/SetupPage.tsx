// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button, Stack, Text, Title } from '@mantine/core';
import { Document, Loading, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { MEDPLUM_CLIENT_ID } from '../config';
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
    if (hasRun.current) {
      return;
    }
    hasRun.current = true;

    if (medplum.isAuthenticated()) {
      queueMicrotask(() => {
        runSetup().catch(console.error);
      });
      return;
    }

    // Redirect to Medplum for auth, or process the ?code= on return
    medplum
      .signInWithRedirect({ clientId: MEDPLUM_CLIENT_ID, redirectUri: window.location.origin + '/setup' })
      .then((profile) => {
        if (profile) {
          // Returned from OAuth redirect with code processed — run setup
          runSetup().catch(console.error);
        }
        // else: page is redirecting to Medplum auth
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'Unknown error');
        setStatus('error');
      });
  }, [medplum, runSetup]);

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
