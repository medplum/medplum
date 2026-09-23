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
import { withFixtures } from '../../stories/decorators';
import { ConfigFixtures, TelehealthService } from '../../stories/scheduling';
import { VisitTypePage } from './VisitTypePage';

export default {
  title: 'Medplum/SchedulingConfigWorkspace/VisitTypePage',
  component: VisitTypePage,
  decorators: [withFixtures(ConfigFixtures)],
  parameters: { skipDefaultSeeding: true },
} as Meta;

/**
 * Opens the page on the visit type as the story's server holds it, so a save is conditional on a real version.
 * @param props - What to do to the stored visit type once the page has it.
 * @param props.outdate - Saves a newer version behind the page's back, so the next Save conflicts.
 * @returns The page, once the visit type is loaded.
 */
function StoredVisitType(props: { readonly outdate?: boolean }): JSX.Element {
  const medplum = useMedplum();
  const [service, setService] = useState<WithId<HealthcareService>>();
  const [stored, setStored] = useState<WithId<HealthcareService>>();

  useEffect(() => {
    medplum
      .readResource('HealthcareService', TelehealthService.id, { cache: 'no-cache' })
      .then(async (loaded) => {
        setService(loaded);
        if (props.outdate) {
          await medplum.updateResource({ ...loaded, name: `${loaded.name} (renamed elsewhere)` });
        }
      })
      .catch(console.error);
  }, [medplum, props.outdate]);

  if (!service) {
    return <Text c="dimmed">Loading…</Text>;
  }
  return (
    <Document>
      <VisitTypePage
        key={stored?.meta?.versionId ?? service.meta?.versionId}
        service={stored ?? service}
        onStored={setStored}
      />
    </Document>
  );
}

/**
 * Telehealth Consult as the workspace opens it: every field shows what is stored and edits it in place. Change
 * anything and the save bar appears; change it back, or press Discard, and it goes away.
 *
 * Its service facilities are empty, which means every one. Adding a first one asks before limiting it.
 * @returns The story.
 */
export const Existing = (): JSX.Element => <StoredVisitType />;

/**
 * A visit type being created, marked as new and not saved yet. Nothing is written until Create, which is refused
 * until it has a name. It starts turned off, so it can't be booked before it is finished, on weekday hours, with
 * no parameters of its own.
 * @returns The story.
 */
export const Create = (): JSX.Element => (
  <Document>
    <VisitTypePage onStored={() => undefined} onDiscardNew={() => undefined} />
  </Document>
);

/**
 * Someone else saved Telehealth Consult after this page opened it. Change a field and press Save: nothing is
 * written over their version, the page says so, and Reload opens it on theirs.
 * @returns The story.
 */
export const SaveConflict = (): JSX.Element => <StoredVisitType outdate />;
