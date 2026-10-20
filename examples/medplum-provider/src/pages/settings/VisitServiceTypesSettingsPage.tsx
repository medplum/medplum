// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader, Select } from '@mantine/core';
import { formatReferenceString, getReferenceString } from '@medplum/core';
import { OperationOutcomeAlert, useMedplumProfile } from '@medplum/react';
import { useSearchResources } from '@medplum/react-hooks';
import { IconCalendar } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useSearchParams } from 'react-router';
import {
  SettingsNote,
  SettingsPage,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from '../../components/settings/SettingsLayout';
import { ScheduleSettings } from '../schedule/ScheduleSettingsPage';

export function VisitServiceTypesSettingsPage(): JSX.Element {
  const profile = useMedplumProfile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [schedules, loading, outcome] = useSearchResources('Schedule', { _count: '100' });

  // Default to the signed-in user's own calendar, falling back to the first one found.
  const ownSchedule = profile
    ? schedules?.find((s) => s.actor.some((a) => a.reference === getReferenceString(profile)))
    : undefined;
  const selectedId = searchParams.get('schedule') ?? ownSchedule?.id ?? schedules?.[0]?.id;
  const selected = schedules?.find((s) => s.id === selectedId);

  return (
    <SettingsPage
      title="Visit Service Types"
      description="Choose which visit service types can be booked on each calendar, and their weekly hours."
    >
      <OperationOutcomeAlert outcome={outcome} />
      <SettingsSection title="Calendar" icon={<IconCalendar size={22} />}>
        <SettingsRow label="Editing" description="The schedule whose visit service types you are editing.">
          <Select
            aria-label="Calendar"
            w={280}
            disabled={loading}
            placeholder={loading ? 'Loading…' : 'Select a calendar'}
            value={selectedId ?? null}
            onChange={(id) => id && setSearchParams({ schedule: id })}
            data={(schedules ?? []).map((s) => ({
              value: s.id,
              label: s.actor.map((a) => formatReferenceString(a)).join(', '),
            }))}
          />
        </SettingsRow>
      </SettingsSection>
      {loading && <Loader />}
      {!loading && !schedules?.length && (
        <SettingsNote>No calendars yet. Create one from the Schedule page.</SettingsNote>
      )}
      {selected && (
        <SettingsPanel>
          <ScheduleSettings key={selected.id} schedule={selected} />
        </SettingsPanel>
      )}
    </SettingsPage>
  );
}
