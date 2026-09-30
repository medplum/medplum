// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text, Tooltip, VisuallyHidden } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { clearScheduleSchedulingParameter } from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useId, useState } from 'react';
import { setScheduleAvailability } from '../availability';
import type { AvailabilityFieldsValue } from './ScheduleAvailabilityEditor.utils';
import {
  fromWeeklyAvailability,
  getAvailabilityFieldsError,
  initialAvailabilityFieldsValue,
} from './ScheduleAvailabilityEditor.utils';
import { ScheduleAvailabilityFields } from './ScheduleAvailabilityFields';

interface CommonProps {
  /** The visit service type the availability being edited applies to. */
  readonly service: WithId<HealthcareService>;
  /**
   * IANA name of the time zone the times entered are in, shown as a hint beneath the week. Resolve it with
   * `getSchedulingTimezone(service, schedule, actor)` from `@medplum/core`, which reads the Schedule
   * parameters, then the service parameters, then the actor's timezone extension, the way the server does.
   * Omit to leave the hint off.
   */
  readonly timezone?: string;
  /** Called when the user cancels. Omit to hide the cancel button, e.g. when the editor is inline on a page. */
  readonly onCancel?: () => void;
}

/**
 * Props for editing the availability override a Schedule holds for one service.
 * @param schedule - The Schedule holding the availability override. Must have exactly one actor, as scheduling requires.
 * @param onSave - Called with the updated Schedule when the user saves. The caller performs the write, and may return a
 * Promise to keep the save button in its pending state until the write settles. A rejection only ends that state, so
 * telling the user the write failed is the caller's to do.
 */
export interface ScheduleOverrideEditorProps extends CommonProps {
  readonly schedule: Schedule;
  readonly onSave: (updatedSchedule: Schedule) => void | Promise<void>;
}

/**
 * Props for editing a service's own default hours, in place of any one calendar's override.
 * @param schedule - Omitted, which is what selects this mode.
 * @param onSave - Called with the updated HealthcareService when the user saves. The caller performs the write, and may
 * return a Promise to keep the save button in its pending state until the write settles. A rejection only ends that
 * state, so telling the user the write failed is the caller's to do.
 */
export interface ServiceDefaultEditorProps extends CommonProps {
  readonly schedule?: undefined;
  readonly onSave: (updatedService: WithId<HealthcareService>) => void | Promise<void>;
}

/**
 * Props for the ScheduleAvailabilityEditor component. Passing a Schedule edits that calendar's override of the
 * service's hours; omitting it edits the service's own default hours, which every calendar without an override
 * inherits. The two are the same weekly form over the same data, differing in where the hours are written.
 */
export type ScheduleAvailabilityEditorProps = ScheduleOverrideEditorProps | ServiceDefaultEditorProps;

/**
 * Edits weekly availability for one visit service type, either as a Schedule's
 * override of the service hours or as the service's own default hours.
 *
 * This renders form content only. The caller supplies the container, so the
 * editor can live inline in a page, in a Modal, or in a Drawer.
 * @param props - Service, an optional Schedule selecting what is edited, and save/cancel handlers
 * @returns The availability editor form
 */
export function ScheduleAvailabilityEditor(props: ScheduleAvailabilityEditorProps): JSX.Element {
  const { schedule, service, timezone, onCancel } = props;
  // Without a Schedule, the service's own hours are what is being edited, so
  // there is no default to inherit from and no override to switch on.
  const editingDefault = schedule === undefined;
  const mode = editingDefault ? 'service' : 'override';
  const [value, setValue] = useState<AvailabilityFieldsValue>(() => initialAvailabilityFieldsValue(service, schedule));
  const [saving, setSaving] = useState(false);
  const reasonId = useId();

  const serviceName = service.name ?? 'this visit service type';
  const emptyWeekReason = getAvailabilityFieldsError(value, service, mode);
  const emptyWeek = emptyWeekReason !== undefined;

  async function handleSave(): Promise<void> {
    if (emptyWeek) {
      return;
    }
    setSaving(true);
    try {
      if (props.schedule) {
        const updated = value.overriding
          ? setScheduleAvailability(props.schedule, service, fromWeeklyAvailability(value.weekly))
          : clearScheduleSchedulingParameter(props.schedule, service, 'availability');
        await props.onSave(updated);
      } else {
        await props.onSave({ ...service, availableTime: fromWeeklyAvailability(value.weekly) });
      }
    } catch (err) {
      // The caller owns the write, and so owns telling the user it failed. All
      // this has to do is leave the pending state without a rejection escaping
      // an event handler that has nowhere to hand it.
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // A `disabled` button emits no pointer events and drops out of the tab order,
  // which would leave the reason it is disabled out of reach in a tooltip.
  // Marking it disabled without the attribute keeps it hoverable and focusable:
  // `aria-disabled` carries the state, the description carries the reason for
  // anyone who cannot see the tooltip, and `handleSave` already refuses to run.
  const saveButton = (
    <Tooltip
      label={emptyWeekReason}
      disabled={!emptyWeek}
      multiline
      w={300}
      withArrow
      position="top"
      // Reaching the button by keyboard should explain it too, not just hovering.
      events={{ hover: true, focus: true, touch: true }}
    >
      <Button
        onClick={handleSave}
        loading={saving}
        fullWidth={!onCancel}
        data-disabled={emptyWeek || undefined}
        aria-disabled={emptyWeek || undefined}
        aria-describedby={emptyWeek ? reasonId : undefined}
      >
        Save Settings
      </Button>
    </Tooltip>
  );

  return (
    <Stack gap="lg">
      <Text c="dimmed">
        {editingDefault
          ? `Set the default weekly working hours for ${serviceName}. Every calendar without hours of its own follows these.`
          : `Customize the weekly working hours on this calendar, in place of the default availability for ${serviceName}.`}
      </Text>
      <Paper withBorder radius="md" p="xl">
        <ScheduleAvailabilityFields
          service={service}
          mode={mode}
          value={value}
          onChange={setValue}
          timezone={timezone}
        />
      </Paper>
      {emptyWeek && (
        <VisuallyHidden id={reasonId} data-testid="schedule-availability-empty-week">
          {emptyWeekReason}
        </VisuallyHidden>
      )}
      {onCancel ? (
        <Group grow>
          <Button variant="default" onClick={onCancel}>
            Cancel
          </Button>
          {saveButton}
        </Group>
      ) : (
        saveButton
      )}
    </Stack>
  );
}
