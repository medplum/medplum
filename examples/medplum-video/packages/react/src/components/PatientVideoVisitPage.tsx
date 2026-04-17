// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { LocalUserChoices } from '@livekit/components-core';
import React, { useState } from 'react';
import { useResource } from '@medplum/react-hooks';
import type { Encounter } from '@medplum/fhirtypes';
import { Stack, Title, Text, Paper, Alert } from '@mantine/core';
import { VideoRoom } from './VideoRoom';
import { VideoLobby } from './VideoLobby';

export interface PatientVideoVisitPageProps {
  readonly encounterId: string;
  readonly generateTokenBotId?: string;
}

/**
 * Full-page patient video visit experience.
 *
 * Handles the flow: device check → waiting room → active visit → post-visit.
 * Designed to be embedded in Foomedical or any patient-facing Medplum app.
 *
 * @param props - The patient video visit page props.
 * @param props.encounterId - The FHIR Encounter ID for the visit.
 * @param props.generateTokenBotId - Bot ID for token generation.
 * @returns A React element rendering the full patient visit flow.
 */
export function PatientVideoVisitPage({
  encounterId,
  generateTokenBotId,
}: PatientVideoVisitPageProps): React.JSX.Element {
  const encounter = useResource<Encounter>({ reference: `Encounter/${encounterId}` });
  const [phase, setPhase] = useState<'lobby' | 'visit' | 'ended'>('lobby');
  const [lobbyChoices, setLobbyChoices] = useState<LocalUserChoices | undefined>();

  if (!encounter) {
    return <Alert color="red">Video visit not found.</Alert>;
  }

  if (encounter.status === 'finished' || phase === 'ended') {
    return (
      <Paper p="xl" shadow="sm">
        <Stack align="center" gap="md">
          <Title order={2}>Visit Complete</Title>
          <Text>Thank you for your visit. Your provider's notes will be available shortly.</Text>
        </Stack>
      </Paper>
    );
  }

  if (phase === 'lobby') {
    return (
      <VideoLobby
        encounterId={encounterId}
        role="patient"
        onJoin={(choices) => {
          setLobbyChoices(choices);
          setPhase('visit');
        }}
      />
    );
  }

  return (
    <VideoRoom
      encounterId={encounterId}
      role="patient"
      generateTokenBotId={generateTokenBotId}
      initialMediaChoices={lobbyChoices}
      onVisitEnd={() => setPhase('ended')}
    />
  );
}
