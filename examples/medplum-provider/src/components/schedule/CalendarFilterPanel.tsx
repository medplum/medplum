// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, MultiSelect, SegmentedControl, Stack, Text } from '@mantine/core';
import type { ResourceType, Schedule } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { getScheduleActorRef, useActorLabels } from '../../hooks/useActorLabels';

export type ColumnMode = 'Practitioner' | 'Location' | 'Device';

export const APPOINTMENT_STATUS_OPTIONS = [
  { value: 'booked', label: 'Confirmed' },
  { value: 'pending', label: 'Unconfirmed' },
  { value: 'checked-in', label: 'Checked-in' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'noshow', label: 'No-show' },
  { value: 'cancelled', label: 'Cancelled' },
];

// Calendar-mode filters only. Visit type and the old "show availability"
// toggle are gone: a roster is visit-type-agnostic (visit type only governs
// availability editing, which now lives in Availability mode), and open
// windows are viewed in Availability mode rather than overlaid here.
export type CalendarFilters = {
  columnMode: ColumnMode;
  // Empty = show every actor of the current View-by type.
  selectedActorRefs: string[];
  // Empty = show every status.
  statuses: string[];
};

export function defaultCalendarFilters(): CalendarFilters {
  return {
    columnMode: 'Practitioner',
    selectedActorRefs: [],
    statuses: [],
  };
}

const COLUMN_MODE_LABELS: Record<ColumnMode, string> = {
  Practitioner: 'Providers',
  Location: 'Rooms',
  Device: 'Devices',
};

/**
 * Left filter panel for Calendar mode. "View by" picks which actor-type lens
 * the overlaid roster is colored/grouped by (Provider = who's seeing whom,
 * Room = room utilization, Device = equipment load). The actor multi-select
 * is load-bearing, not a nicety: with all actors overlaid in one grid,
 * color-coding only stays legible for a handful at a time, so narrowing to
 * the 2–4 actors you care about is the intended workflow. Status narrows
 * which appointment states render.
 * @param props - Filter panel props.
 * @param props.pools - Schedules grouped by actor resourceType.
 * @param props.filters - Current filter state.
 * @param props.onChange - Called with updated filter state.
 * @returns The Calendar-mode filter panel element.
 */
export function CalendarFilterPanel(props: {
  pools: Partial<Record<ResourceType, Schedule[]>>;
  filters: CalendarFilters;
  onChange: (filters: CalendarFilters) => void;
}): JSX.Element {
  const { pools, filters, onChange } = props;
  const labels = useActorLabels(pools);

  const currentPool = pools[filters.columnMode];
  const actorOptions = (currentPool ?? [])
    .map((s) => getScheduleActorRef(s))
    .filter((ref): ref is string => !!ref)
    .map((ref) => ({ value: ref, label: labels.get(ref) ?? ref }));

  return (
    <Stack gap="sm">
      <Box>
        <Text size="sm" fw={500} mb={4}>
          View by
        </Text>
        <SegmentedControl
          fullWidth
          value={filters.columnMode}
          onChange={(value) => onChange({ ...filters, columnMode: value as ColumnMode, selectedActorRefs: [] })}
          data={[
            { label: 'Providers', value: 'Practitioner' },
            { label: 'Rooms', value: 'Location' },
            { label: 'Devices', value: 'Device' },
          ]}
        />
      </Box>

      <MultiSelect
        label={COLUMN_MODE_LABELS[filters.columnMode]}
        description="Pick a few to keep the overlay readable"
        placeholder={filters.selectedActorRefs.length === 0 ? 'All' : undefined}
        data={actorOptions}
        value={filters.selectedActorRefs}
        onChange={(selectedActorRefs) => onChange({ ...filters, selectedActorRefs })}
        clearable
      />

      <MultiSelect
        label="Status"
        placeholder={filters.statuses.length === 0 ? 'All statuses' : undefined}
        data={APPOINTMENT_STATUS_OPTIONS}
        value={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses })}
        clearable
      />
    </Stack>
  );
}
