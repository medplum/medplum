// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { TrackLoop, ParticipantTile, useParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Group, Paper, Text } from '@mantine/core';

/**
 * Renders all participants in a grid layout.
 * Uses TrackLoop to iterate over camera tracks, with ParticipantTile for each.
 *
 * @returns A React element rendering the participant grid.
 */
export function ParticipantView(): React.JSX.Element {
  const participants = useParticipants();
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  if (participants.length === 0) {
    return (
      <Paper p="xl" ta="center">
        <Text c="dimmed">Waiting for participants to join...</Text>
      </Paper>
    );
  }

  return (
    <Group gap="md" className="medplum-participant-grid" wrap="wrap">
      <TrackLoop tracks={tracks}>
        <ParticipantTile />
      </TrackLoop>
    </Group>
  );
}
