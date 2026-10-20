// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Select, Stack, Text, Textarea } from '@mantine/core';
import { formatDate } from '@medplum/core';
import { Modal } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { toLocalCalendarDate } from '../../utils/candid';
import type { ClaimFollowUp } from './claimActions';

const FOLLOW_UP_DAYS = [7, 14, 21, 35];

export interface ClaimFollowUpModalProps {
  readonly opened: boolean;
  /** How many claims the follow-up is for, for the title. */
  readonly count: number;
  readonly onClose: () => void;
  readonly onSave: (followUp: ClaimFollowUp) => void;
}

/**
 * Asks for a follow-up date and a note saying why the claims are set aside.
 * @param props - The ClaimFollowUpModal React props.
 * @returns The ClaimFollowUpModal React node.
 */
export function ClaimFollowUpModal(props: ClaimFollowUpModalProps): JSX.Element {
  const { opened, count, onClose, onSave } = props;
  const options = FOLLOW_UP_DAYS.map((days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const value = toLocalCalendarDate(date);
    return { value, label: `${formatDate(value)} (${days} days)` };
  });
  const [date, setDate] = useState(options[0].value);
  const [note, setNote] = useState('');

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={count === 1 ? 'Set follow-up' : `Set follow-up on ${count} claims`}
      actions={
        <Button disabled={!note.trim()} onClick={() => onSave({ date, note: note.trim() })}>
          Set follow-up
        </Button>
      }
    >
      <Stack gap="md">
        <Select
          label="Follow up on"
          data={options}
          value={date}
          allowDeselect={false}
          onChange={(value) => value && setDate(value)}
        />
        <Textarea
          label="Note"
          required
          data-autofocus
          placeholder="Appeal sent, check for a decision"
          minRows={3}
          autosize
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Follow-ups aren't saved yet. They last until the page reloads.
        </Text>
      </Stack>
    </Modal>
  );
}
