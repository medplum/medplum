// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { LiveKitRoom } from '@livekit/components-react';
import { useSubscription } from '@medplum/react-hooks';
import type { Bundle, Encounter } from '@medplum/fhirtypes';
import { Stack, Text, Loader, Paper } from '@mantine/core';

export interface WaitingRoomProps {
  encounterId: string;
  token: string;
  livekitHost: string;
  message?: string;
  onAdmitted?: () => void;
}

/**
 * Shown to patients while they wait for the provider to admit them.
 *
 * The patient is connected to the LiveKit room (so the provider can see
 * they've arrived) but canPublish is false — no audio/video is sent.
 * When the provider admits the patient, the encounter status changes
 * to in-progress and `onAdmitted` fires.
 *
 * @param props - The waiting room component props.
 * @param props.encounterId - The FHIR Encounter ID.
 * @param props.token - LiveKit access token.
 * @param props.livekitHost - LiveKit server WebSocket URL.
 * @param props.message - Custom message to display while waiting.
 * @param props.onAdmitted - Callback invoked when the provider admits the patient.
 * @returns A React element rendering the waiting room UI.
 */
export function WaitingRoom({
  encounterId,
  token,
  livekitHost,
  message = 'Your provider will be with you shortly.',
  onAdmitted,
}: WaitingRoomProps): React.JSX.Element {
  useSubscription(`Encounter?_id=${encounterId}`, (bundle: Bundle) => {
    const encounter = bundle.entry?.[0]?.resource as Encounter | undefined;
    if (encounter?.status === 'in-progress') {
      onAdmitted?.();
    }
  });

  return (
    <LiveKitRoom serverUrl={livekitHost} token={token} connect={true} video={false} audio={false}>
      <Paper shadow="sm" p="xl" radius="md" className="medplum-waiting-room">
        <Stack align="center" gap="lg">
          <Loader size="lg" />
          <Text size="xl" fw={600}>
            Waiting Room
          </Text>
          <Text size="md" c="dimmed" ta="center">
            {message}
          </Text>
          <WaitTimer />
        </Stack>
      </Paper>
    </LiveKitRoom>
  );
}

function WaitTimer(): React.JSX.Element {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return (
    <Text size="sm" c="dimmed">
      Waiting: {minutes}:{seconds.toString().padStart(2, '0')}
    </Text>
  );
}
