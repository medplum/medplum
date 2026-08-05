// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Switch,
  Text,
  Tooltip,
  VisuallyHidden,
} from '@mantine/core';
import type { DayOfWeek, WithId } from '@medplum/core';
import {
  clearScheduleAvailability,
  hasScheduleAvailability,
  resolveAvailability,
  setScheduleAvailability,
} from '@medplum/core';
import type { HealthcareService, Schedule } from '@medplum/fhirtypes';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useId, useRef, useState } from 'react';
import classes from './ScheduleAvailabilityEditor.module.css';
import type { DayAvailability, WeeklyAvailability } from './ScheduleAvailabilityEditor.utils';
import {
  canAddRange,
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  DEFAULT_RANGE,
  formatMinutesOfDay,
  fromWeeklyAvailability,
  hasAnyAvailableDay,
  MINUTES_PER_DAY,
  nextRange,
  toWeeklyAvailability,
} from './ScheduleAvailabilityEditor.utils';
import type { TimeSelectHandle } from './TimeSelect';
import { TimeSelect } from './TimeSelect';

// Holds the track at the colour it has when checked, in place of the grey a
// disabled Switch would otherwise take.
const AVAILABLE_READ_ONLY_SWITCH_STYLES = {
  track: { backgroundColor: 'var(--mantine-color-green-6)', borderColor: 'transparent' },
};

interface DayRowProps {
  readonly day: DayOfWeek;
  readonly value: DayAvailability;
  /** The row shows the service default that is in effect, so none of it can be edited. */
  readonly readOnly: boolean;
  readonly onChange: (value: DayAvailability) => void;
  readonly onAnnounce: (message: string) => void;
}

function DayRow(props: DayRowProps): JSX.Element {
  const { day, value, readOnly, onChange, onAnnounce } = props;
  const { available, ranges } = value;
  const label = DAY_LABELS[day];
  // The end inputs, so that an end the editor moves can be flashed where it
  // moved. React clears an entry when its block is removed.
  const endInputs = useRef<(TimeSelectHandle | null)[]>([]);

  // Each block is bounded by its neighbours, so the times on offer are only ever
  // the ones still free that day. The last block may run to midnight.
  function boundsAfter(index: number): number {
    return index === ranges.length - 1 ? MINUTES_PER_DAY : ranges[index + 1].start;
  }

  // A start may be set anywhere still free that day, even past its own end, so
  // that a later block can be opened without editing it twice. When that
  // happens the end moves an hour out from the new start. The move is flashed
  // for anyone watching and announced for anyone not.
  function setStart(index: number, start: number): void {
    const range = ranges[index];
    const end = start >= range.end ? Math.min(start + 60, boundsAfter(index)) : range.end;
    if (end !== range.end) {
      endInputs.current[index]?.flash();
      onAnnounce(`${label} block ${index + 1} end time changed to ${formatMinutesOfDay(end)}.`);
    }
    onChange({ ...value, ranges: ranges.with(index, { start, end }) });
  }

  function setEnd(index: number, end: number): void {
    onChange({ ...value, ranges: ranges.with(index, { ...ranges[index], end }) });
  }

  // Mantine greys out a Switch it has disabled, which reads as "off" rather than
  // "not editable", so a day that is available keeps its colour.
  const switchStyles = readOnly && available ? AVAILABLE_READ_ONLY_SWITCH_STYLES : undefined;
  const canAdd = canAddRange(ranges);

  return (
    <>
      <Group gap="sm" wrap="nowrap" className={classes.dayCell}>
        <Switch
          checked={available}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            onChange({
              available: checked,
              ranges: checked && ranges.length === 0 ? [{ ...DEFAULT_RANGE }] : ranges,
            });
          }}
          color="green.6"
          withThumbIndicator={false}
          disabled={readOnly}
          styles={switchStyles}
          aria-label={`Available on ${label}`}
          data-testid={`schedule-availability-switch-${day}`}
        />
        <Text fw={500}>{label}</Text>
      </Group>
      {available ? (
        ranges.map((range, index) => {
          const last = index === ranges.length - 1;
          return (
            // Blocks are kept sorted and non-overlapping, so a row's position
            // in the day is a stable enough identity for it.
            <Fragment key={index}>
              <TimeSelect
                className={classes.rangeStart}
                value={range.start}
                min={index === 0 ? 0 : ranges[index - 1].end}
                // Bounds are exclusive by a minute rather than by a whole
                // step, so a neighbour stored off the interval still leaves
                // the usual times on offer here.
                max={boundsAfter(index) - 1}
                onChange={(start) => setStart(index, start)}
                disabled={readOnly}
                label={`${label} block ${index + 1} start time`}
                testId={`schedule-availability-start-${day}-${index}`}
              />
              <Text c="dimmed" className={classes.rangeSeparator}>
                to
              </Text>
              <TimeSelect
                ref={(handle) => {
                  endInputs.current[index] = handle;
                }}
                className={classes.rangeEnd}
                value={range.end}
                min={range.start + 1}
                max={boundsAfter(index)}
                onChange={(end) => setEnd(index, end)}
                disabled={readOnly}
                label={`${label} block ${index + 1} end time`}
                testId={`schedule-availability-end-${day}-${index}`}
              />
              {last && (
                <ActionIcon
                  className={classes.addAction}
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  onClick={() => onChange({ ...value, ranges: [...ranges, nextRange(ranges)] })}
                  disabled={readOnly || !canAdd}
                  aria-label={`Add another block of hours on ${label}`}
                  data-testid={`schedule-availability-add-${day}`}
                >
                  <IconPlus size={16} stroke={1.8} />
                </ActionIcon>
              )}
              {ranges.length > 1 && (
                <ActionIcon
                  className={classes.removeAction}
                  variant="subtle"
                  color="gray"
                  radius="xl"
                  onClick={() => onChange({ ...value, ranges: ranges.toSpliced(index, 1) })}
                  disabled={readOnly}
                  aria-label={`Remove ${label} block ${index + 1}`}
                  data-testid={`schedule-availability-remove-${day}-${index}`}
                >
                  <IconMinus size={16} stroke={1.8} />
                </ActionIcon>
              )}
            </Fragment>
          );
        })
      ) : (
        <Text c="dimmed" className={classes.unavailable}>
          Unavailable
        </Text>
      )}
    </>
  );
}

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
 * Promise to keep the save button in its pending state until the write settles.
 */
export interface ScheduleOverrideEditorProps extends CommonProps {
  readonly schedule: Schedule;
  readonly onSave: (updatedSchedule: Schedule) => void | Promise<void>;
}

/**
 * Props for editing a service's own default hours, in place of any one calendar's override.
 * @param schedule - Omitted, which is what selects this mode.
 * @param onSave - Called with the updated HealthcareService when the user saves. The caller performs the write, and may
 * return a Promise to keep the save button in its pending state until the write settles.
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
  // Seed from the Schedule override when it has one, otherwise from the
  // service-level default, so the editor opens showing the hours currently in
  // effect rather than a blank week.
  const [overriding, setOverriding] = useState(() => (schedule ? hasScheduleAvailability(schedule, service) : true));
  // `resolveAvailability` falls back to the service default on its own, and
  // reads the service alone when there is no Schedule, so it covers both modes.
  const [weekly, setWeekly] = useState<WeeklyAvailability>(() =>
    toWeeklyAvailability(resolveAvailability(service, schedule))
  );
  const [saving, setSaving] = useState(false);
  // The flash on an auto-moved end time is only visible, so the same change is
  // also announced.
  const [announcement, setAnnouncement] = useState('');
  const reasonId = useId();

  const serviceName = service.name ?? 'this visit service type';

  // Neither mode can express a week with no hours in it, and each fails in its
  // own direction. An override with zero available days serializes to
  // `{ url: 'availability', extension: [] }`, which fails FHIR constraint ext-1
  // on write. A service with zero available days has no `availableTime` at all,
  // which scheduling reads as unrestricted rather than unavailable, so that
  // save would quietly do the opposite of what the emptied form shows. Both
  // need at least one available day; a week that really is around the clock is
  // entered as one, day by day.
  const emptyWeek = (editingDefault || overriding) && !hasAnyAvailableDay(weekly);
  const emptyWeekReason = editingDefault
    ? `Default availability must include at least one available day. Clearing every day would leave ${serviceName} ` +
      `bookable around the clock rather than never; to stop scheduling it, deactivate the visit service type.`
    : `Custom availability must include at least one available day. ` +
      `To stop scheduling ${serviceName} on this calendar, turn it off in schedule settings.`;

  // Switching the override off puts the service default back in effect, so the
  // greyed out hours show that default rather than edits that no longer apply.
  function toggleOverriding(next: boolean): void {
    setOverriding(next);
    if (!next) {
      setWeekly(toWeeklyAvailability(service.availableTime));
    }
  }

  async function handleSave(): Promise<void> {
    if (emptyWeek) {
      return;
    }
    setSaving(true);
    try {
      if (props.schedule) {
        const updated = overriding
          ? setScheduleAvailability(props.schedule, service, fromWeeklyAvailability(weekly))
          : clearScheduleAvailability(props.schedule, service);
        await props.onSave(updated);
      } else {
        await props.onSave({ ...service, availableTime: fromWeeklyAvailability(weekly) });
      }
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
          : `Customize your weekly working hours to override the general availability for ${serviceName}.`}
      </Text>
      <Paper withBorder radius="md" p="xl">
        {!editingDefault && (
          <>
            <Group gap="sm" wrap="nowrap" className={classes.overrideToggle}>
              <Switch
                checked={overriding}
                onChange={(e) => toggleOverriding(e.currentTarget.checked)}
                color="green.6"
                withThumbIndicator={false}
                aria-label={`Enable custom availability for ${serviceName}`}
                data-testid="schedule-availability-enable"
              />
              <Text fw={500}>Enable custom availability for {serviceName}</Text>
            </Group>
            <Divider my="lg" />
          </>
        )}
        <Box className={classes.week} opacity={overriding ? 1 : 0.8}>
          {DAY_DISPLAY_ORDER.map((day) => (
            <DayRow
              key={day}
              day={day}
              value={weekly[day]}
              readOnly={!overriding}
              onChange={(value) => setWeekly((prev) => ({ ...prev, [day]: value }))}
              onAnnounce={setAnnouncement}
            />
          ))}
        </Box>
        <VisuallyHidden role="status" aria-live="polite" data-testid="schedule-availability-announcement">
          {announcement}
        </VisuallyHidden>
        <Stack gap="sm" mt="xl">
          {!editingDefault && (
            <Group justify="flex-start">
              <Anchor
                component="button"
                type="button"
                onClick={() => setWeekly(toWeeklyAvailability(service.availableTime))}
                disabled={!overriding}
                c={overriding ? undefined : 'dimmed'}
                underline={overriding ? 'hover' : 'never'}
                data-testid="schedule-availability-reset"
              >
                Reset to default availability of {serviceName}
              </Anchor>
            </Group>
          )}
          {timezone && (
            <Text c="dimmed" data-testid="schedule-availability-timezone">
              All times are in local {timezone} time zone.
            </Text>
          )}
        </Stack>
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
