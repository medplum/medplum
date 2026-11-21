// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Loader, Popover, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { formatDateTime } from '@medplum/core';
import type { ClaimItem, Condition, Reference } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceName, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { getLineAuthor } from '../../utils/claims';
import { showErrorNotification } from '../../utils/notifications';
import classes from './ClaimEditor.module.css';
import type { LineChange } from './lineHistory';
import { loadDiagnosisHistory, loadLineHistory } from './lineHistory';

export interface HistoryPopoverProps {
  /** Who added the row; without one, the slot stays empty. */
  readonly author?: Reference;
  /** When they added it. */
  readonly added?: string;
  /** Loads the row's history, newest first. */
  readonly load: () => Promise<LineChange[]>;
}

/**
 * Who added a row, as their avatar. Clicking it opens the row's full history: each change, who made it and when.
 * @param props - The HistoryPopover React props.
 * @returns The avatar with its history, or an empty slot when the author isn't known.
 */
export function HistoryPopover(props: HistoryPopoverProps): JSX.Element {
  const { author, added, load } = props;
  const [history, setHistory] = useState<LineChange[]>();
  const [opened, setOpened] = useState(false);

  if (!author) {
    return <div className={classes.authorSlot} />;
  }

  const open = (): void => {
    setOpened(true);
    load()
      .then(setHistory)
      .catch((err) => {
        setHistory([]);
        showErrorNotification(err);
      });
  };

  return (
    <div className={classes.authorSlot}>
      {/* Styled like the search toolbar's filter and sort popovers. */}
      <Popover
        position="bottom-end"
        width={320}
        shadow="md"
        radius="md"
        withinPortal
        onOpen={open}
        onClose={() => setOpened(false)}
      >
        <Tooltip label="View History" position="top" openDelay={200} disabled={opened}>
          <Popover.Target>
            <UnstyledButton aria-label="View History" className={classes.avatarButton}>
              {/* An empty alt keeps the browser's own tooltip off the initials. */}
              <ResourceAvatar value={author} radius="xl" size={28} alt="" />
            </UnstyledButton>
          </Popover.Target>
        </Tooltip>
        <Popover.Dropdown p={0} className={classes.historyDropdown}>
          <div className={classes.historyBody}>
            {/* Like a menu's section label, e.g. Export in a claim's menu. */}
            <Text size="xs" fw={500} c="light-dark(var(--mantine-color-gray-7), var(--mantine-color-dark-1))">
              History
            </Text>
            {!history && <Loader size="sm" />}
            {history && (
              <ScrollArea.Autosize mah={320} type="auto">
                <Stack gap="sm">
                  {history.length === 0 && <AddedEntry author={author} added={added} />}
                  {history.map((change, i) => (
                    <HistoryEntry key={`${change.time}-${i}`} change={change} />
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            )}
          </div>
        </Popover.Dropdown>
      </Popover>
    </div>
  );
}

/**
 * A service line's history: its charge item's versions and, on a claim, the claim's changes to it.
 * @param props - The line, and the claim it's on; none for the visit's own lines.
 * @param props.item - The line.
 * @param props.claimId - The claim the line is on.
 * @returns The avatar with its history.
 */
export function LineHistoryPopover(props: { readonly item: ClaimItem; readonly claimId?: string }): JSX.Element {
  const { item, claimId } = props;
  const medplum = useMedplum();
  return <HistoryPopover {...getLineAuthor(item)} load={() => loadLineHistory(medplum, item, claimId)} />;
}

/**
 * A diagnosis's history: its Condition's versions on the visit and, on a claim, the claim's changes to it.
 * @param props - The diagnosis code, its Condition on the visit, and the claim it's on.
 * @param props.code - The ICD-10 code.
 * @param props.condition - The visit's Condition for it, if any.
 * @param props.claimId - The claim; none for the visit's own diagnoses.
 * @returns The avatar with its history.
 */
export function DiagnosisHistoryPopover(props: {
  readonly code: string;
  readonly condition?: Condition;
  readonly claimId?: string;
}): JSX.Element {
  const { code, condition, claimId } = props;
  const medplum = useMedplum();
  return (
    <HistoryPopover
      author={condition?.recorder ?? condition?.asserter ?? condition?.meta?.author}
      added={condition?.recordedDate}
      load={() => loadDiagnosisHistory(medplum, code, condition, claimId)}
    />
  );
}

// The date and time to the minute, e.g. "11/12/2026, 1:41 PM".
const HISTORY_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
};

function HistoryEntry(props: { readonly change: LineChange }): JSX.Element {
  const { change } = props;
  return (
    <Group gap="xs" wrap="nowrap" align="center">
      {change.author ? (
        <ResourceAvatar value={change.author} radius="xl" size="calc(1.5rem * var(--mantine-scale))" alt="" />
      ) : (
        <div style={{ width: 'calc(1.5rem * var(--mantine-scale))', flex: 'none' }} />
      )}
      <Stack gap={0} miw={0}>
        {change.changes.map((text) => (
          <Text key={text} size="sm">
            {text}
          </Text>
        ))}
        <Text size="xs" c="dimmed">
          {change.author ? <ResourceName value={change.author} inherit /> : 'Unknown'}
          {change.time ? ` · ${formatDateTime(change.time, undefined, HISTORY_TIME_FORMAT)}` : ''}
        </Text>
      </Stack>
    </Group>
  );
}

// A line not saved yet has no history, only who added it.
function AddedEntry(props: { readonly author: Reference; readonly added?: string }): JSX.Element {
  return <HistoryEntry change={{ author: props.author, time: props.added, changes: ['Added'] }} />;
}
