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
import {
  ConfigFixtures,
  DrNguyenPractitioner,
  DrPatelPractitioner,
  DrReyesPractitioner,
  ExamRoomC,
} from '../../stories/scheduling';
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
 * Opens the page on an actor as the story's server holds it, and reads it again after each save, the way the
 * workspace swaps in what was stored.
 * @param props - The actor to open.
 * @param props.resourceType - Its type.
 * @param props.id - Its id.
 * @returns The page, once the actor is loaded.
 */
function StoredActor(props: { readonly resourceType: BookableActorType; readonly id: string }): JSX.Element {
  const { resourceType, id } = props;
  const medplum = useMedplum();
  const [loaded, setLoaded] = useState<Loaded>();
  const [reads, setReads] = useState(0);

  useEffect(() => {
    Promise.all([searchConfigurableActors(medplum, resourceType, {}), searchConfigurableServices(medplum, {})])
      .then(([actors, services]) => {
        const actor = actors.actors.find((found) => found.resource.id === id);
        if (actor) {
          setLoaded({ actor, services: services.services });
        }
      })
      .catch(console.error);
  }, [medplum, resourceType, id, reads]);

  if (!loaded) {
    return <Text c="dimmed">Loading…</Text>;
  }
  const [schedule] = loaded.actor.schedules;
  return (
    <Box p="md">
      <ActorPage
        key={`${schedule?.id}-${schedule?.meta?.versionId}`}
        actor={loaded.actor}
        services={loaded.services}
        onSynced={() => setReads((count) => count + 1)}
      />
    </Box>
  );
}

/**
 * Dr. Linh Nguyen offers two visit types. Ultrasound Imaging follows the visit type in everything. Telehealth
 * Consult has a longer buffer after and custom hours on this Schedule: open its entry to see both, with every
 * field it leaves empty showing what it inherits.
 * @returns The story.
 */
export const ProviderWithOverrides = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrNguyenPractitioner.id} />
);

/**
 * Dr. Sofia Reyes is on leave: still active, with the Schedule switched off, so booking won't offer her.
 * @returns The story.
 */
export const ProviderOnLeave = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrReyesPractitioner.id} />
);

/**
 * Exam Room C has no Schedule, so it offers nothing and there is no Schedule status switch. Offering a first
 * visit type creates its Schedule when you save, and not before.
 * @returns The story.
 */
export const RoomWithNoSchedule = (): JSX.Element => <StoredActor resourceType="Location" id={ExamRoomC.id} />;

/**
 * Dr. Anika Patel offers Walk-in Clinic, and neither she nor the visit type sets a time zone. Her name is kept by
 * the system she comes from and is read-only; her status and time zone are edited here.
 *
 * Pick a Time zone under General and the entry's custom hours are read in it at once. Save writes the time zone
 * to her `Practitioner` and nothing else.
 * @returns The story.
 */
export const ProviderTimeZone = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrPatelPractitioner.id} />
);

/**
 * A room being created, marked as new and not saved yet. Nothing is written until Create, which is refused until
 * it has a name. It starts active and is typed as a room, at the service facility picked from the same list
 * booking filters by. Visit types can be offered once it is created.
 * @returns The story.
 */
export const CreateRoom = (): JSX.Element => {
  const medplum = useMedplum();
  const [services, setServices] = useState<WithId<HealthcareService>[]>();

  useEffect(() => {
    searchConfigurableServices(medplum, {})
      .then((result) => setServices(result.services))
      .catch(console.error);
  }, [medplum]);

  if (!services) {
    return <Text c="dimmed">Loading…</Text>;
  }
  return (
    <Box p="md">
      <ActorPage
        newActorType="Location"
        services={services}
        onSynced={() => undefined}
        onDiscardNew={() => undefined}
      />
    </Box>
  );
};
