// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Anchor, Box, Divider, Group, Stack, Switch, Text, VisuallyHidden } from '@mantine/core';
import type { DayOfWeek, WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import type { JSX } from 'react';
import { Fragment, useRef, useState } from 'react';
import classes from './ScheduleAvailabilityEditor.module.css';
import type { AvailabilityFieldsValue, AvailabilityMode, DayAvailability } from './ScheduleAvailabilityEditor.utils';
import {
  canAddRange,
  DAY_DISPLAY_ORDER,
  DAY_LABELS,
  DEFAULT_RANGE,
  formatMinutesOfDay,
  MINUTES_PER_DAY,
  nextRange,
  toWeeklyAvailability,
} from './ScheduleAvailabilityEditor.utils';
import type { TimeSelectHandle } from './TimeSelect';
import { TimeSelect } from './TimeSelect';

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

export interface ScheduleAvailabilityFieldsProps {
  /** The visit type whose hours are edited, or whose default a calendar overrides. */
  readonly service: WithId<HealthcareService>;
  readonly mode: AvailabilityMode;
  readonly value: AvailabilityFieldsValue;
  readonly onChange: (value: AvailabilityFieldsValue) => void;
  /** IANA name of the time zone the times entered are in, shown as a hint beneath the week. */
  readonly timezone?: string;
}

/**
 * Edits a week of hours for one visit type. The parent holds the value, blocks its save on
 * `getAvailabilityFieldsError`, and supplies the container.
 * @param props - The service, the mode, the hours as entered, and a change handler.
 * @returns The weekly availability fields.
 */
export function ScheduleAvailabilityFields(props: ScheduleAvailabilityFieldsProps): JSX.Element {
  const { service, mode, value, onChange, timezone } = props;
  const { weekly, overriding } = value;
  // The flash on an auto-moved end time is only visible, so the same change is
  // also announced. Carried with a counter because the same message twice over
  // is the same string, which React renders as no change at all: the live region
  // never mutates and nothing is read out. Keying the text on the counter
  // replaces the text node instead, which the region does announce.
  const [announcement, setAnnouncement] = useState({ message: '', id: 0 });

  const serviceName = service.name ?? 'this visit service type';

  // Switching the override off puts the service default back in effect, so the
  // greyed out hours show that default rather than edits that no longer apply.
  function toggleOverriding(next: boolean): void {
    onChange({ overriding: next, weekly: next ? weekly : toWeeklyAvailability(service.availableTime) });
  }

  return (
    <>
      {mode === 'override' && (
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
            onChange={(dayValue) => onChange({ overriding, weekly: { ...weekly, [day]: dayValue } })}
            onAnnounce={(message) => setAnnouncement((previous) => ({ message, id: previous.id + 1 }))}
          />
        ))}
      </Box>
      <VisuallyHidden role="status" aria-live="polite" data-testid="schedule-availability-announcement">
        <Fragment key={announcement.id}>{announcement.message}</Fragment>
      </VisuallyHidden>
      <Stack gap="sm" mt="xl">
        {mode === 'override' && (
          <Group justify="flex-start">
            <Anchor
              component="button"
              type="button"
              onClick={() => onChange({ overriding, weekly: toWeeklyAvailability(service.availableTime) })}
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
    </>
  );
}
