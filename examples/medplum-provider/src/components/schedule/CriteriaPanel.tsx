// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Input, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Patient, ResourceType, Schedule } from '@medplum/fhirtypes';
import { ResourceInput } from '@medplum/react';
import type { JSX } from 'react';
import { useActorLabels, getScheduleActorRef } from '../../hooks/useActorLabels';
import classes from './CriteriaPanel.module.css';

export type TimeOfDay = 'any' | 'morning' | 'afternoon';

export type Criteria = {
  provider: string; // actor reference string, or 'any'
  room: string;
  device: string;
  dateStart: string; // yyyy-mm-dd
  dateEnd: string;
  timeOfDay: TimeOfDay;
};

type CriteriaPanelProps = {
  pools: Partial<Record<ResourceType, Schedule[]>>;
  clinicName: string;
  criteria: Criteria;
  onChange: (criteria: Criteria) => void;
  // Optional: known ahead of search so the "Recommended" combo heuristic
  // (spec §4.4) can factor in the patient's preferred-provider note, and
  // pre-fills the booking confirmation drawer's own patient picker (spec §6
  // step 4 — existing patients only, no inline quick-create) — which
  // remains authoritative and editable, this is just a default.
  patient: WithId<Patient> | undefined;
  onPatientChange: (patient: WithId<Patient> | undefined) => void;
};

const ANY = 'any';

function actorOptions(pools: Schedule[] | undefined, labels: Map<string, string>): { value: string; label: string }[] {
  const options = [{ value: ANY, label: 'Any eligible' }];
  for (const schedule of pools ?? []) {
    const ref = getScheduleActorRef(schedule);
    if (ref) {
      options.push({ value: ref, label: labels.get(ref) ?? ref });
    }
  }
  return options;
}

/**
 * Find & Book criteria panel (spec §6.2): Location is fixed to the single
 * demo clinic, Room/Provider/Device are Any-vs-specific selects populated
 * from the resolved resource pools, plus a date range and time-of-day
 * preference. "Visit Method" (the PRD's "contact type" — in-person /
 * telehealth / phone) is kept visible but functionally inert for this
 * scenario, matching the PRD field for completeness (spec §2 audience note).
 * @param props - Criteria panel props.
 * @returns A React element rendering the criteria panel.
 */
export function CriteriaPanel(props: CriteriaPanelProps): JSX.Element {
  const { pools, clinicName, criteria, onChange, patient, onPatientChange } = props;
  const labels = useActorLabels(pools);

  return (
    <Stack gap="sm">
      <Input.Wrapper label="Location">
        <Text size="sm">{clinicName}</Text>
      </Input.Wrapper>

      <Stack gap={4}>
        <ResourceInput<WithId<Patient>>
          label="Patient (optional)"
          resourceType="Patient"
          name="criteria-patient"
          defaultValue={patient}
          onChange={onPatientChange}
        />
        <Text size="xs" c="dimmed">
          Biases the Recommended combo and pre-fills the patient at booking — still editable there
        </Text>
      </Stack>

      <Select
        label="Room"
        data={actorOptions(pools.Location, labels)}
        value={criteria.room}
        onChange={(value) => onChange({ ...criteria, room: value ?? ANY })}
        allowDeselect={false}
      />

      <Select
        label="Provider"
        data={actorOptions(pools.Practitioner, labels)}
        value={criteria.provider}
        onChange={(value) => onChange({ ...criteria, provider: value ?? ANY })}
        allowDeselect={false}
      />

      <Select
        label="Device"
        data={actorOptions(pools.Device, labels)}
        value={criteria.device}
        onChange={(value) => onChange({ ...criteria, device: value ?? ANY })}
        allowDeselect={false}
      />

      <Select
        label="Visit Method"
        description="Not used by this visit type"
        data={[{ value: 'in-person', label: 'In Person' }]}
        value="in-person"
        disabled
        onChange={() => {}}
      />

      <Input.Wrapper label="Date range">
        <div className={classes.dateRange}>
          <input
            type="date"
            value={criteria.dateStart}
            onChange={(e) => onChange({ ...criteria, dateStart: e.target.value })}
            className={classes.dateInput}
          />
          <Text size="sm" c="dimmed">
            to
          </Text>
          <input
            type="date"
            value={criteria.dateEnd}
            onChange={(e) => onChange({ ...criteria, dateEnd: e.target.value })}
            className={classes.dateInput}
          />
        </div>
      </Input.Wrapper>

      <Input.Wrapper label="Time of day">
        <SegmentedControl
          fullWidth
          value={criteria.timeOfDay}
          onChange={(value) => onChange({ ...criteria, timeOfDay: value as TimeOfDay })}
          data={[
            { value: 'any', label: 'Any' },
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
          ]}
        />
      </Input.Wrapper>
    </Stack>
  );
}
