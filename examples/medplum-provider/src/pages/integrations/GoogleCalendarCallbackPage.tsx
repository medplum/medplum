// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Loader, Stack, Text } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { connectGoogleCalendar, GOOGLE_CALENDAR_PATH, takePendingGoogleCalendarAuth } from '../../utils/googleCalendar';
import { showSuccessNotification } from '../../utils/notifications';

/*
 * Google redirects here after consent. The page checks the state it saved before the redirect,
 * then sends the code and PKCE verifier to the connect operation, which exchanges them server side.
 */
export function GoogleCalendarCallbackPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string>();
  const started = useRef(false);

  useEffect(() => {
    // Authorization codes are single use; guard against effects running twice.
    if (started.current) {
      return;
    }
    started.current = true;

    const googleError = searchParams.get('error');
    const code = searchParams.get('code');
    const pending = takePendingGoogleCalendarAuth(searchParams.get('state'));

    async function finish(): Promise<void> {
      if (googleError) {
        throw new Error(googleError === 'access_denied' ? 'Google Calendar access was not granted.' : googleError);
      }
      if (!code || !pending) {
        throw new Error('This sign-in link is invalid or has expired. Start again from the Google Calendar page.');
      }
      await connectGoogleCalendar(medplum, code, pending.codeVerifier, pending.redirectUri, pending.eventDetailLevel);
      showSuccessNotification({ message: 'Google Calendar connected. The first sync can take a few minutes.' });
      navigate(GOOGLE_CALENDAR_PATH, { replace: true })?.catch(console.error);
    }

    finish().catch((err: unknown) => setError(normalizeErrorString(err)));
  }, [medplum, navigate, searchParams]);

  return (
    <Stack maw={720} mx="auto" my="xl" px="md">
      {error ? (
        <Alert color="red" icon={<IconAlertCircle />} title="Could not connect Google Calendar">
          <Text size="sm">{error}</Text>
          <Anchor component={Link} to={GOOGLE_CALENDAR_PATH} size="sm">
            Back to Google Calendar
          </Anchor>
        </Alert>
      ) : (
        <>
          <Loader />
          <Text>Connecting Google Calendar&hellip;</Text>
        </>
      )}
    </Stack>
  );
}
