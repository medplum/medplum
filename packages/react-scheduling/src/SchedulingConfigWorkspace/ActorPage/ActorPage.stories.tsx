// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BookableActorType } from '../../actors';
import type { ConfigurableActor } from '../../configSearch';
import { searchConfigurableActors, searchConfigurableServices } from '../../configSearch';
import { withFixtures } from '../../stories/decorators';
import { ConfigFixtures, DrNguyenPractitioner, ExamRoomC } from '../../stories/scheduling';
import { ActorPage } from './ActorPage';

export default {
  title: 'Medplum/SchedulingConfigWorkspace/ActorPage',
  component: ActorPage,
  decorators: [withFixtures(ConfigFixtures)],
  parameters: { skipDefaultSeeding: true },
} as Meta;

interface Loaded {
  readonly actor: ConfigurableActor;
  readonly services: WithId<HealthcareService>[];
}

/**
 * Opens the page on an actor as the story's server holds it.
 * @param props - The actor to open.
 * @param props.resourceType - Its type.
 * @param props.id - Its id.
 * @returns The page, once the actor is loaded.
 */
function StoredActor(props: { readonly resourceType: BookableActorType; readonly id: string }): JSX.Element {
  const { resourceType, id } = props;
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState<Loaded>();

  useEffect(() => {
    Promise.all([searchConfigurableActors(medplum, resourceType, {}), searchConfigurableServices(medplum, {})])
      .then(([actors, services]) => {
        const actor = actors.items.find((found) => found.resource.id === id);
        if (actor) {
          setLoaded({ actor, services: services.items });
        }
      })
      .catch(console.error);
  }, [medplum, resourceType, id]);

  if (!loaded) {
    return <Text c="dimmed">Loading…</Text>;
  }
  return (
    <Box p="md">
      <ActorPage actor={loaded.actor} services={loaded.services} />
    </Box>
  );
}

/**
 * Dr. Linh Nguyen offers two visit types. Ultrasound Imaging follows the visit type in everything. Telehealth
 * Consult has a longer buffer after and custom hours on this calendar.
 * @returns The story.
 */
export const ProviderWithOverrides = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrNguyenPractitioner.id} />
);

/**
 * Exam Room C has no calendar, so it offers nothing.
 * @returns The story.
 */
export const RoomWithNoCalendar = (): JSX.Element => <StoredActor resourceType="Location" id={ExamRoomC.id} />;
