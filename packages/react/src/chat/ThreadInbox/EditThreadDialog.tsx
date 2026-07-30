// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Modal, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { isReference, normalizeErrorString } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import classes from './EditThreadDialog.module.css';
import { ThreadMessageForm } from './ThreadMessageForm';

/**
 * Props for the EditThreadDialog component.
 * @param thread - The thread (root Communication) to edit, as a resource or a reference to resolve.
 * @param opened - Whether the dialog is open.
 * @param onClose - Callback fired when the dialog is closed.
 * @param onSaved - Callback fired with the updated Communication resource after a successful save.
 */
export interface EditThreadDialogProps {
  thread: Communication | Reference<Communication>;
  opened: boolean;
  onClose: () => void;
  onSaved?: (communication: Communication) => void;
}

export const EditThreadDialog = (props: EditThreadDialogProps): JSX.Element => {
  const { opened, onClose, onSaved } = props;
  const medplum = useMedplum();
  const thread = useResource(props.thread);

  const patientRef = thread?.subject as Reference<Patient> | undefined;
  const initialPractitioners = useMemo(() => {
    const fromRecipients = (thread?.recipient ?? []).filter((r) => isReference<Practitioner>(r, 'Practitioner'));
    if (fromRecipients.length > 0) {
      return fromRecipients;
    }
    // Fallback for threads with no practitioner recipient (e.g. legacy/patient-only threads):
    // surface the sender when it is a Practitioner, so the field isn't empty. Saving then
    // migrates this practitioner into the recipient list.
    const sender = thread?.sender;
    if (isReference<Practitioner>(sender, 'Practitioner')) {
      return [sender];
    }
    return [];
  }, [thread?.recipient, thread?.sender]);

  // The dialog is mounted only while open (see ThreadInbox), so this state initializes fresh on
  // each open — edits dismissed without saving are abandoned with no leftover form state.
  const [topic, setTopic] = useState(thread?.topic?.text ?? '');
  const [practitioners, setPractitioners] = useState<Reference<Practitioner>[]>(initialPractitioners);

  // When the thread is passed as a reference it resolves after mount, so re-initialize
  // the form state when it arrives (React's "adjusting state when a prop changes" pattern).
  const [initializedThread, setInitializedThread] = useState(thread);
  if (thread !== initializedThread) {
    setInitializedThread(thread);
    setTopic(thread?.topic?.text ?? '');
    setPractitioners(initialPractitioners);
  }

  const handleSave = async (): Promise<void> => {
    if (!thread) {
      return;
    }
    // Preserve all non-Practitioner recipients (the patient subject, RelatedPerson,
    // CareTeam, etc.) and replace only the Practitioner entries with the edited set,
    // so editing the topic/practitioners never silently drops other participants.
    const preservedRecipients = (thread.recipient ?? []).filter((r) => !isReference<Practitioner>(r, 'Practitioner'));
    const updated: Communication = {
      ...thread,
      recipient: [...preservedRecipients, ...practitioners],
      topic: topic ? { text: topic } : undefined,
    };

    try {
      const saved = await medplum.updateResource(updated);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showNotification({ color: 'red', message: normalizeErrorString(error) });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Message Settings" size="md" classNames={classes}>
      {thread && (
        <Stack gap={0}>
          <Stack gap="lg" p="lg">
            <ThreadMessageForm
              defaultPractitioners={initialPractitioners}
              onPractitionersChange={setPractitioners}
              topic={topic}
              onTopicChange={setTopic}
              defaultPatient={patientRef}
            />
          </Stack>

          <Box px="lg" pb="lg">
            <Button w="100%" onClick={handleSave} disabled={practitioners.length === 0}>
              Save
            </Button>
          </Box>
        </Stack>
      )}
    </Modal>
  );
};
