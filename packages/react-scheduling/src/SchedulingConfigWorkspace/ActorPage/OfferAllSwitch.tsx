// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Switch } from '@mantine/core';
import type { JSX } from 'react';
import { useState } from 'react';
import { ConfirmModal } from '../ConfirmModal';

const NAMED_LIMIT = 5;
const listAll = new Intl.ListFormat('en', { type: 'conjunction' });

/** What switching it on would make bookable. */
export interface OfferAllCoverage {
  /** The active visit types it covers. */
  readonly total: number;
  /** The names of those with no hours of their own or here, which become bookable around the clock. */
  readonly withoutHours: readonly string[];
}

/** What switching it off keeps. */
export interface OfferAllKeeping {
  readonly kept: number;
  readonly dropped: number;
  /** Whether visit types named before it was switched on are among those kept. */
  readonly restoresEarlier: boolean;
}

export interface OfferAllSwitchProps {
  readonly actorName: string;
  readonly checked: boolean;
  readonly coverage: OfferAllCoverage;
  readonly keeping: OfferAllKeeping;
  readonly onChange: (checked: boolean) => void;
}

/**
 * Switches an actor's Schedule between offering every active visit type and offering the ones it names, confirming
 * either way.
 * @param props - The actor, whether it offers every visit type, and what switching would do.
 * @returns The switch.
 */
export function OfferAllSwitch(props: OfferAllSwitchProps): JSX.Element {
  const { actorName, checked, coverage, keeping, onChange } = props;
  const [asking, setAsking] = useState<'on' | 'off'>();

  function confirm(): void {
    onChange(asking === 'on');
    setAsking(undefined);
  }

  return (
    <>
      <Switch
        label="Offer all visit types"
        description="Every active visit type, including ones added later. Each can still be customized here."
        checked={checked}
        onChange={(event) => setAsking(event.currentTarget.checked ? 'on' : 'off')}
      />
      <ConfirmModal
        opened={asking === 'on'}
        title="Offer all visit types?"
        cancelLabel="Cancel"
        confirmLabel="Offer all"
        onCancel={() => setAsking(undefined)}
        onConfirm={confirm}
        warning={describeWithoutHours(coverage.withoutHours)}
      >
        {describeCoverage(actorName, coverage)}
      </ConfirmModal>
      <ConfirmModal
        opened={asking === 'off'}
        title="Stop offering all visit types?"
        cancelLabel="Keep offering all"
        confirmLabel="Stop offering all"
        destructive
        onCancel={() => setAsking(undefined)}
        onConfirm={confirm}
      >
        {describeKeeping(actorName, keeping)}
      </ConfirmModal>
    </>
  );
}

function describeCoverage(actorName: string, { total }: OfferAllCoverage): string {
  return `${actorName} will be bookable for ${total === 1 ? 'the 1 active visit type' : `all ${total} active visit types`}, and any added later, once you save.`;
}

function describeWithoutHours(names: readonly string[]): string | undefined {
  if (names.length === 0) {
    return undefined;
  }
  const listed =
    names.length > NAMED_LIMIT ? [...names.slice(0, NAMED_LIMIT), `${names.length - NAMED_LIMIT} more`] : names;
  const subject = listAll.format(listed);
  return names.length === 1
    ? `${subject} has no hours of its own, so it's bookable around the clock unless you set hours for it here.`
    : `${subject} have no hours of their own, so they're bookable around the clock unless you set hours for them here.`;
}

function describeKeeping(actorName: string, { kept, dropped, restoresEarlier }: OfferAllKeeping): string {
  let first: string;
  if (kept === 0) {
    first = `${actorName} will stop offering all ${count(dropped, 'visit type')} once you save.`;
  } else if (dropped === 0) {
    first = `${actorName} will keep offering the ${count(kept, 'visit type')} it offers now once you save.`;
  } else {
    const which = restoresEarlier ? 'offered before, or customized here' : 'customized here';
    first = `${actorName} will keep offering the ${count(kept, 'visit type')} ${which}, and stop offering the other ${dropped} once you save.`;
  }
  return `${first} Visit types added later won't be offered. Existing appointments aren't changed.`;
}

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
