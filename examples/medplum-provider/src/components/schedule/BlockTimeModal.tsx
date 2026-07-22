// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Checkbox, Group, Modal, Select, Stack, Switch, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';

export const BLOCK_REASONS = [
  { value: 'Out of office', label: 'Out of office' },
  { value: 'Holiday', label: 'Holiday' },
  { value: 'Maintenance / calibration', label: 'Maintenance / calibration' },
];

// A fully-specified block request. Timed blocks are a single day with
// start/end times (Google's model — timed events don't span days here);
// all-day blocks span an inclusive date range of full days.
export type BlockSpec = {
  reason: string;
  allDay: boolean;
  date: string; // yyyy-mm-dd — used when !allDay
  startTime: string; // HH:mm — used when !allDay
  endTime: string; // HH:mm — used when !allDay
  startDate: string; // yyyy-mm-dd — used when allDay
  endDate: string; // yyyy-mm-dd — used when allDay
  applyToAll: boolean;
};

export type BlockTimeDefaults = {
  date?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function BlockForm(props: {
  actorTypeLabel: string;
  defaults?: BlockTimeDefaults;
  onSubmit: (spec: BlockSpec) => void;
  onCancel: () => void;
}): JSX.Element {
  const { defaults } = props;
  const initialDate = defaults?.date ?? todayISO();
  const [reason, setReason] = useState<string>(BLOCK_REASONS[0].value);
  const [allDay, setAllDay] = useState<boolean>(defaults?.allDay ?? false);
  const [date, setDate] = useState<string>(initialDate);
  const [startTime, setStartTime] = useState<string>(defaults?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState<string>(defaults?.endTime ?? '17:00');
  const [startDate, setStartDate] = useState<string>(initialDate);
  const [endDate, setEndDate] = useState<string>(initialDate);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);

  const invalid = allDay ? endDate < startDate : endTime <= startTime;

  return (
    <Stack gap="sm">
      <Select label="Reason" data={BLOCK_REASONS} value={reason} onChange={(v) => setReason(v ?? BLOCK_REASONS[0].value)} />

      <Switch label="All day" checked={allDay} onChange={(e) => setAllDay(e.currentTarget.checked)} />

      {allDay ? (
        <Group grow>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Start date
            </Text>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <Text size="sm" fw={500} mb={4}>
              End date
            </Text>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </Group>
      ) : (
        <>
          <div>
            <Text size="sm" fw={500} mb={4}>
              Date
            </Text>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Group grow>
            <div>
              <Text size="sm" fw={500} mb={4}>
                Start
              </Text>
              <input type="time" step={60} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Text size="sm" fw={500} mb={4}>
                End
              </Text>
              <input type="time" step={60} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </Group>
        </>
      )}

      <Checkbox
        label={`Apply to all ${props.actorTypeLabel} (holiday / whole-practice closure)`}
        checked={applyToAll}
        onChange={(e) => setApplyToAll(e.currentTarget.checked)}
      />

      <Group justify="flex-end" mt="sm">
        <Button variant="default" onClick={props.onCancel}>
          Cancel
        </Button>
        <Button
          disabled={invalid}
          onClick={() => props.onSubmit({ reason, allDay, date, startTime, endTime, startDate, endDate, applyToAll })}
        >
          Block time
        </Button>
      </Group>
    </Stack>
  );
}

/**
 * Google-Calendar-style time-off creation (Calendar spec, revised): pick a
 * reason, toggle all-day, and either set a single day + start/end times or an
 * all-day date range. "Apply to all …" turns a one-actor block into a
 * whole-practice holiday cascade (one `busy-unavailable` Slot per affected
 * schedule), replacing the earlier separate single/bulk forms with one
 * coherent surface. Opened blank from a "Block time" button, or pre-filled
 * from a drag on the time-off calendar.
 * @param props - Modal props.
 * @param props.opened - Whether the modal is open.
 * @param props.onClose - Close handler.
 * @param props.actorTypeLabel - Plural label for the apply-to-all checkbox (e.g. "providers").
 * @param props.defaults - Pre-fill from a calendar drag (date/times/all-day).
 * @param props.onSubmit - Called with the fully-specified block request.
 * @returns The block-time modal element.
 */
export function BlockTimeModal(props: {
  opened: boolean;
  onClose: () => void;
  actorTypeLabel: string;
  defaults?: BlockTimeDefaults;
  onSubmit: (spec: BlockSpec) => void;
}): JSX.Element {
  // Key the inner form on the defaults so each open (esp. a fresh drag) seeds
  // clean initial state without a setState-in-effect.
  const formKey = props.opened
    ? `${props.defaults?.date ?? ''}-${props.defaults?.startTime ?? ''}-${props.defaults?.endTime ?? ''}-${props.defaults?.allDay ?? ''}`
    : 'closed';
  return (
    <Modal opened={props.opened} onClose={props.onClose} title="Block time">
      <BlockForm
        key={formKey}
        actorTypeLabel={props.actorTypeLabel}
        defaults={props.defaults}
        onSubmit={props.onSubmit}
        onCancel={props.onClose}
      />
    </Modal>
  );
}
