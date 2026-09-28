// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { Document } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { Meta } from '@storybook/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import type { BookableActorType } from '../../actors';
import type { ConfigurableActor } from '../../configSearch';
import { searchConfigurableActors, searchConfigurableServices } from '../../configSearch';
import { withFixtures } from '../../stories/decorators';
import { ConfigFixtures, DrNguyenPractitioner, DrPatelPractitioner, ExamRoomC } from '../../stories/scheduling';
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
 * Opens the page on an actor as the story's server holds it. The page carries on from what it saves.
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
        const actor = actors.actors.find((found) => found.resource.id === id);
        if (actor) {
          setLoaded({ actor, services: services.services });
        }
      })
      .catch(console.error);
  }, [medplum, resourceType, id]);

  if (!loaded) {
    return <Text c="dimmed">Loading…</Text>;
  }
  return (
    <Document>
      <ActorPage actor={loaded.actor} services={loaded.services} onStored={() => undefined} />
    </Document>
  );
}

/**
 * Dr. Linh Nguyen offers two visit types. Ultrasound Imaging follows the visit type in everything. Telehealth
 * Consult has a longer buffer after and custom hours on this calendar: open its entry to see both, with every
 * field it leaves empty showing what it inherits.
 *
 * Offer another visit type, or stop offering one, and the save bar appears.
 * @returns The story.
 */
export const ProviderWithOverrides = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrNguyenPractitioner.id} />
);

/**
 * Exam Room C has no calendar, so it offers nothing and there is no Accepting appointments switch. Offering a
 * first visit type creates its calendar when you save, and not before.
 *
 * Ultrasound Imaging is held only at the main clinic, where the room is, so it can be offered. Any visit type
 * held elsewhere is listed, but disabled, with the reason.
 * @returns The story.
 */
export const RoomWithNoCalendar = (): JSX.Element => <StoredActor resourceType="Location" id={ExamRoomC.id} />;

/**
 * Dr. Anika Patel offers Walk-in Clinic, and neither she nor the visit type sets a time zone, so its hours can't
 * be booked and the entry says so. Her name and status are kept by the system she comes from and are read-only.
 *
 * Pick a Time zone under General and the hours are read in it at once. Save writes the time zone to her
 * `Practitioner` and nothing else.
 * @returns The story.
 */
export const ProviderTimeZone = (): JSX.Element => (
  <StoredActor resourceType="Practitioner" id={DrPatelPractitioner.id} />
);

/**
 * A room being created, marked as new and not saved yet. Nothing is written until Create, which is refused until
 * it has a name. It is stored active and typed as a room, at the service facility picked from the same list
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
    <Document>
      <ActorPage
        newActorType="Location"
        services={services}
        onStored={() => undefined}
        onDiscardNew={() => undefined}
      />
    </Document>
  );
};
