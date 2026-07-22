// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { formatDateTime, parseReference } from '@medplum/core';
import type { Reference, ResourceType } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useMemo } from 'react';
import type { ComboSlot } from '../../hooks/useMultiResourceFind';
import { localDayKey } from '../../utils/scheduling';

type SlotListProps = {
  slots: ComboSlot[];
  actorLabel: (ref: Reference) => string;
  onSelect: (slot: ComboSlot) => void;
};

const FIELD_LABEL: Partial<Record<ResourceType, string>> = {
  Practitioner: 'Provider',
  Location: 'Room',
  Device: 'Device',
};

const TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
const DAY_HEADER_FORMAT: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' };

// Appointment.start/end are optional per FHIR, but $find always populates
// them on proposed appointments — this is just to satisfy the type checker.
function startOf(slot: ComboSlot): string {
  return slot.appointment.start ?? '';
}
function endOf(slot: ComboSlot): string {
  return slot.appointment.end ?? '';
}

function durationMinutes(slot: ComboSlot): number {
  const start = new Date(startOf(slot)).getTime();
  const end = new Date(endOf(slot)).getTime();
  return Math.round((end - start) / 60_000);
}

function actorFields(
  slot: ComboSlot,
  actorLabel: (ref: Reference) => string
): { resourceType: ResourceType; label: string; value: string }[] {
  return slot.combo.schedules.map((s) => {
    const ref = s.actor[0];
    const resourceType = parseReference(ref)[0];
    return { resourceType, label: FIELD_LABEL[resourceType] ?? resourceType, value: actorLabel(ref) };
  });
}

type ComboCluster = {
  key: string;
  times: ComboSlot[]; // same combo, ascending by start
};

type DayGroup = {
  dayKey: string;
  label: string;
  clusters: ComboCluster[];
};

// Groups slots first by calendar day, then by resource combo within that
// day — since `slots` arrives soonest-first, a combo's cluster naturally
// ends up positioned by its earliest available time, and its `times` array
// is already ascending. This turns "20 nearly-identical cards, one per
// 15-minute alignment interval" into one card per combo with a row of
// clickable start-time chips.
function groupByDayThenCombo(slots: ComboSlot[]): DayGroup[] {
  const days = new Map<string, { label: string; clusterOrder: string[]; clusters: Map<string, ComboCluster> }>();

  for (const slot of slots) {
    const start = startOf(slot);
    const dayKey = localDayKey(start);
    let day = days.get(dayKey);
    if (!day) {
      day = { label: new Date(start).toLocaleDateString(undefined, DAY_HEADER_FORMAT), clusterOrder: [], clusters: new Map() };
      days.set(dayKey, day);
    }
    let cluster = day.clusters.get(slot.combo.key);
    if (!cluster) {
      cluster = { key: slot.combo.key, times: [] };
      day.clusters.set(slot.combo.key, cluster);
      day.clusterOrder.push(slot.combo.key);
    }
    cluster.times.push(slot);
  }

  return [...days.entries()].map(([dayKey, day]) => ({
    dayKey,
    label: day.label,
    clusters: day.clusterOrder.map((key) => day.clusters.get(key) as ComboCluster),
  }));
}

/**
 * Slot list (spec §6.3): grouped by calendar day (soonest day first), and
 * within a day, grouped by resource combo — one card per combo showing its
 * Provider/Room/Device once, with a row of clickable start-time chips,
 * rather than one full card per 15-minute alignment interval repeating the
 * same resources. No recommendation/ranking — every time chip is a plain,
 * equally-weighted choice.
 * @param props - Slot list props.
 * @returns A React element rendering the slot list.
 */
export function SlotList(props: SlotListProps): JSX.Element {
  const { slots, actorLabel, onSelect } = props;

  const dayGroups = useMemo(() => groupByDayThenCombo(slots), [slots]);

  if (slots.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No available appointments found for the selected criteria and date range.
      </Text>
    );
  }

  return (
    <Stack gap="lg">
      {dayGroups.map((day) => (
        <Stack gap="xs" key={day.dayKey}>
          <Title order={4}>{day.label}</Title>
          {day.clusters.map((cluster) => (
            <Paper withBorder p="sm" radius="md" key={cluster.key}>
              <Group justify="space-between" align="flex-start" wrap="wrap" mb="xs">
                <Group gap="lg" wrap="wrap" align="center">
                  {actorFields(cluster.times[0], actorLabel).map((field) => (
                    <Stack gap={0} key={field.resourceType}>
                      <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
                        {field.label}
                      </Text>
                      <Text size="sm">{field.value}</Text>
                    </Stack>
                  ))}
                </Group>
                <Text size="xs" c="dimmed">
                  {durationMinutes(cluster.times[0])} min visit
                </Text>
              </Group>

              <Group gap="xs" wrap="wrap">
                {cluster.times.map((slot) => (
                  <Button key={startOf(slot)} size="sm" variant="outline" color="teal" onClick={() => onSelect(slot)}>
                    {formatDateTime(startOf(slot), undefined, TIME_FORMAT)}
                  </Button>
                ))}
              </Group>
            </Paper>
          ))}
        </Stack>
      ))}
    </Stack>
  );
}
