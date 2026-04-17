// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { Button, Card, Group, Stack, Text, Badge } from '@mantine/core';

export interface UpcomingVideoVisitsProps {
  onJoinVisit: (encounterId: string) => void;
}

/**
 * Shows the patient's upcoming and joinable video visits.
 * Drop into any patient portal dashboard.
 *
 * @param props - The upcoming video visits component props.
 * @param props.onJoinVisit - Callback invoked with the encounter ID when the patient joins a visit.
 * @returns A React element rendering the list of upcoming visits.
 */
export function UpcomingVideoVisits({ onJoinVisit }: UpcomingVideoVisitsProps): React.JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient | undefined;
  const [encounters, setEncounters] = useState<Encounter[]>([]);

  useEffect(() => {
    if (!profile?.id) {return;}
    medplum
      .searchResources('Encounter', {
        subject: `Patient/${profile.id}`,
        class: 'VR',
        status: 'planned,arrived,in-progress',
        _sort: '-date',
        _count: '10',
      })
      .then(setEncounters)
      .catch(console.error);
  }, [medplum, profile?.id]);

  if (encounters.length === 0) {
    return <Text c="dimmed">No upcoming video visits.</Text>;
  }

  return (
    <Stack gap="sm">
      {encounters.map((enc) => {
        const isJoinable = enc.status === 'arrived' || enc.status === 'in-progress';
        return (
          <Card key={enc.id} withBorder padding="sm">
            <Group justify="space-between">
              <div>
                <Text fw={500}>Video Visit</Text>
                <Text size="sm" c="dimmed">
                  {enc.period?.start ? new Date(enc.period.start).toLocaleString() : 'Time TBD'}
                </Text>
              </div>
              <Group gap="xs">
                <Badge color={isJoinable ? 'green' : 'gray'}>{enc.status}</Badge>
                {isJoinable && (
                  <Button size="sm" onClick={() => { if (enc.id) { onJoinVisit(enc.id); } }}>
                    Join Visit
                  </Button>
                )}
              </Group>
            </Group>
          </Card>
        );
      })}
    </Stack>
  );
}
