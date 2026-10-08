// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Stack, Textarea, TextInput } from '@mantine/core';
import type { MedplumClient, WithId } from '@medplum/core';
import { createReference, isDefined, normalizeErrorString } from '@medplum/core';
import type { Bundle, Schedule, Slot } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { BookableActorType } from '../../actors';
import { BOOKABLE_ACTOR_TYPES } from '../../actors';
import { AppointmentActorSelect } from '../../AppointmentFinder/AppointmentActorSelect';
import type { ScheduleCandidate } from '../../AppointmentFinder/AppointmentFinder.schedules';
import {
  formatZonedDateTimeInput,
  getNativeInputType,
  parseZonedDateTimeInput,
} from '../../AppointmentFinder/AppointmentFinder.times';
import type { DateTimeRange } from '../../types';

type CandidatesByActorType = Readonly<Record<BookableActorType, readonly ScheduleCandidate[]>>;

const NONE_CHOSEN: CandidatesByActorType = { Practitioner: [], Location: [], Device: [] };

export interface BlockTimeFormProps {
  /** The calendars that can be blocked, by actor type. */
  readonly candidatesByActorType: CandidatesByActorType;
  /** The time the form opens on. A new one resets the times but keeps the calendars and comment. */
  readonly defaultRange: DateTimeRange;
  /** Called when the time typed changes, with undefined while it is not a whole range. */
  readonly onChangeTime?: (range: DateTimeRange | undefined) => void;
  /**
   * Called with the Slots written. A failure here is logged rather than shown: the
   * time is blocked by the time it runs.
   */
  readonly onBlocked?: (slots: WithId<Slot>[]) => void | Promise<void>;
}

/**
 * Takes time off the calendars chosen, without booking a visit into it.
 *
 * Writes a `busy` Slot over the time on each of them, all in one transaction, and
 * announces each so views reading Slots draw them.
 *
 * @param props - The React props.
 * @returns The form.
 */
export function BlockTimeForm(props: BlockTimeFormProps): JSX.Element {
  const { candidatesByActorType, defaultRange, onChangeTime, onBlocked } = props;
  const medplum = useMedplum();

  const [startValue, setStartValue] = useState(() => formatZonedDateTimeInput(defaultRange.start));
  const [endValue, setEndValue] = useState(() => formatZonedDateTimeInput(defaultRange.end));
  const [chosen, setChosen] = useState<CandidatesByActorType>(NONE_CHOSEN);
  const [comment, setComment] = useState('');
  const [writing, setWriting] = useState(false);
  const [written, setWritten] = useState(false);
  const [writeError, setWriteError] = useState<unknown>();

  const [shownRange, setShownRange] = useState(defaultRange);
  if (shownRange !== defaultRange) {
    setShownRange(defaultRange);
    setStartValue(formatZonedDateTimeInput(defaultRange.start));
    setEndValue(formatZonedDateTimeInput(defaultRange.end));
    setWritten(false);
  }

  const start = parseZonedDateTimeInput(startValue);
  const end = parseZonedDateTimeInput(endValue);
  const endsBeforeStart = start !== undefined && end !== undefined && end <= start;
  const range = start && end && !endsBeforeStart ? { start, end } : undefined;
  const schedules = BOOKABLE_ACTOR_TYPES.flatMap((actorType) => chosen[actorType].map((c) => c.schedule));

  // Seeded with the opening range, so mounting doesn't report it back.
  const startMs = range?.start.getTime();
  const endMs = range?.end.getTime();
  const reportedTime = useRef(`${defaultRange.start.getTime()}-${defaultRange.end.getTime()}`);
  useEffect(() => {
    const key = `${startMs}-${endMs}`;
    if (reportedTime.current !== key) {
      reportedTime.current = key;
      onChangeTime?.(
        startMs !== undefined && endMs !== undefined ? { start: new Date(startMs), end: new Date(endMs) } : undefined
      );
    }
  }, [startMs, endMs, onChangeTime]);

  function choose(actorType: BookableActorType, candidates: readonly ScheduleCandidate[]): void {
    setChosen((previous) => ({ ...previous, [actorType]: candidates }));
    setWritten(false);
  }

  async function handleSubmit(): Promise<void> {
    if (!range || schedules.length === 0) {
      return;
    }
    setWriting(true);
    setWriteError(undefined);
    try {
      const slots = await writeBlockSlots(medplum, { schedules, ...range, comment: comment.trim() || undefined });
      setWritten(true);

      // executeBatch doesn't notify the client what it changed.
      for (const slot of slots) {
        medplum.notifyResourceModified({ resourceType: 'Slot', operation: 'create', id: slot.id, resource: slot });
      }

      // Without `transaction-bundles` the bundle runs as a batch and can land partly.
      // Stays disabled: a retry would block the calendars that took it twice.
      if (slots.length < schedules.length) {
        throw new Error(
          `Blocked ${slots.length} of ${schedules.length} calendars. Check the calendar for which ones are missing.`
        );
      }

      try {
        await onBlocked?.(slots);
      } catch (error) {
        console.error(error);
      }
    } catch (error) {
      setWriteError(error);
    } finally {
      setWriting(false);
    }
  }

  return (
    <Stack gap="sm">
      <TextInput
        label="Start"
        type={getNativeInputType('datetime-local')}
        required
        value={startValue}
        onChange={(event) => {
          setStartValue(event.currentTarget.value);
          setWritten(false);
        }}
      />
      <TextInput
        label="End"
        type={getNativeInputType('datetime-local')}
        required
        value={endValue}
        error={endsBeforeStart ? 'End must be after start.' : undefined}
        onChange={(event) => {
          setEndValue(event.currentTarget.value);
          setWritten(false);
        }}
      />

      {BOOKABLE_ACTOR_TYPES.map((actorType) => (
        <AppointmentActorSelect
          key={actorType}
          actorType={actorType}
          service={undefined}
          candidates={candidatesByActorType[actorType]}
          required={false}
          onChange={(candidates) => choose(actorType, candidates)}
        />
      ))}

      <Textarea
        label="Comment"
        autosize
        minRows={2}
        value={comment}
        onChange={(event) => {
          setComment(event.currentTarget.value);
          setWritten(false);
        }}
      />

      {writeError !== undefined && (
        <Alert color="red" title="Could not block this time">
          {normalizeErrorString(writeError)}
        </Alert>
      )}
      <Button fullWidth disabled={!range || schedules.length === 0 || written} loading={writing} onClick={handleSubmit}>
        Block time
      </Button>
    </Stack>
  );
}

interface BlockSlotsOptions {
  readonly schedules: readonly WithId<Schedule>[];
  readonly start: Date;
  readonly end: Date;
  readonly comment?: string;
}

/**
 * Writes a `busy` Slot over the time on each schedule, in one transaction: all or none
 * land, on projects with the `transaction-bundles` feature.
 * @see https://www.medplum.com/docs/fhir-datastore/fhir-batch-requests#batches-vs-transactions
 * @param medplum - The client to write through.
 * @param options - The schedules, the time, and the comment.
 * @returns The Slots written.
 */
async function writeBlockSlots(medplum: MedplumClient, options: BlockSlotsOptions): Promise<WithId<Slot>[]> {
  const { schedules, start, end, comment } = options;
  const written = (await medplum.executeBatch({
    resourceType: 'Bundle',
    type: 'transaction',
    entry: schedules.map((schedule) => ({
      resource: {
        resourceType: 'Slot',
        schedule: createReference(schedule),
        status: 'busy',
        start: start.toISOString(),
        end: end.toISOString(),
        comment,
      } satisfies Slot,
      request: { method: 'POST', url: 'Slot' } as const,
    })),
  })) as Bundle<WithId<Slot>>;
  return (written.entry ?? []).map((entry) => entry.resource).filter(isDefined);
}
