// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { LocalUserChoices } from '@livekit/components-core';
import React from 'react';
import { PreJoin } from '@livekit/components-react';
import '@livekit/components-styles';
import { Stack, Text } from '@mantine/core';
import { useResource } from '@medplum/react-hooks';
import type { Encounter, Patient, Reference } from '@medplum/fhirtypes';

export interface VideoLobbyProps {
  encounterId: string;
  role: 'provider' | 'patient';
  /** Called with device choices from LiveKit PreJoin when the user joins. */
  onJoin: (choices: LocalUserChoices) => void;
}

/**
 * Pre-join lobby using LiveKit `PreJoin`: camera/mic preview and device selection.
 * Shows patient name from the encounter for provider context.
 *
 * @param props - Lobby props.
 * @param props.encounterId - FHIR Encounter id.
 * @param props.onJoin - Invoked with selected devices when the user confirms join.
 * @returns The pre-join UI.
 */
export function VideoLobby({ encounterId, onJoin }: VideoLobbyProps): React.JSX.Element {
  const encounter = useResource<Encounter>({ reference: `Encounter/${encounterId}` });
  const patient = useResource<Patient>(encounter?.subject as Reference<Patient> | undefined);

  return (
    <Stack gap="md" p="lg">
      <Text size="xl" fw={700}>
        Video Visit
      </Text>
      {patient && (
        <Text>
          Patient: {patient.name?.[0]?.given?.join(' ')} {patient.name?.[0]?.family}
        </Text>
      )}
      <PreJoin
        persistUserChoices={true}
        onSubmit={onJoin}
        onError={(err) => console.error('PreJoin error:', err)}
        joinLabel="Join video visit"
        micLabel="Microphone"
        camLabel="Camera"
      />
    </Stack>
  );
}
