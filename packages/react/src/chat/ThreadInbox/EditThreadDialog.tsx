// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Modal, Stack, Text, TextInput } from '@mantine/core';
import { createReference, isReference } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import classes from './messageModalStyles.module.css';
import { showErrorNotification } from './notifications';

/**
 * Props for the EditThreadDialog component.
 * @param thread - The thread (root Communication) to edit.
 * @param opened - Whether the dialog is open.
 * @param onClose - Callback fired when the dialog is closed.
 * @param onSaved - Callback fired with the updated Communication resource after a successful save.
 */
export interface EditThreadDialogProps {
  thread: Communication;
  opened: boolean;
  onClose: () => void;
  onSaved?: (communication: Communication) => void;
}

export const EditThreadDialog = (props: EditThreadDialogProps): JSX.Element => {
  const { thread, opened, onClose, onSaved } = props;
  const medplum = useMedplum();

  const patientRef = thread.subject as Reference<Patient> | undefined;

  // Existing practitioner recipients, identified by the "Practitioner/" reference prefix
  // (the patient subject and any other recipient types are excluded).
  const initialPractitioners = useMemo(() => {
    const fromRecipients = (thread.recipient ?? []).filter((r) => isReference<Practitioner>(r, 'Practitioner'));
    if (fromRecipients.length > 0) {
      return fromRecipients;
    }
    // Fallback for threads with no practitioner recipient (e.g. legacy/patient-only threads):
    // surface the sender when it is a Practitioner, so the field isn't empty. Saving then
    // migrates this practitioner into the recipient list.
    const sender = thread.sender;
    if (isReference<Practitioner>(sender, 'Practitioner')) {
      return [sender];
    }
    return [];
  }, [thread.recipient, thread.sender]);

  // The dialog is mounted only while open (see ThreadInbox), so this state initializes fresh on
  // each open — edits dismissed without saving are abandoned with no leftover form state.
  const [topic, setTopic] = useState(thread.topic?.text ?? '');
  const [practitioners, setPractitioners] = useState<Reference<Practitioner>[]>(initialPractitioners);

  const handleSave = async (): Promise<void> => {
    // Preserve all non-Practitioner recipients (the patient subject, RelatedPerson,
    // CareTeam, etc.) and replace only the Practitioner entries with the edited set,
    // so editing the topic/practitioners never silently drops other participants.
    const preservedRecipients = (thread.recipient ?? []).filter((r) => !r.reference?.startsWith('Practitioner/'));
    const updated: Communication = {
      ...thread,
      recipient: [...preservedRecipients, ...practitioners],
      topic: { text: topic },
    };

    try {
      const saved = await medplum.updateResource(updated);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showErrorNotification(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Message Settings" size="md" classNames={classes}>
      <Stack gap={0}>
        <Stack gap="lg" p="lg">
          {/* The subject reference is passed straight to ResourceInput, which resolves it for
              display. The patient cannot be changed or added after creation, so practitioner-only
              threads (no subject) omit this field entirely. */}
          {patientRef && (
            <Stack gap={0}>
              <Text fw={500}>Patient</Text>

              <ResourceInput resourceType="Patient" name="patient" defaultValue={patientRef} disabled={true} />
            </Stack>
          )}

          <Stack gap={0}>
            <Text fw={500}>Practitioner</Text>
            <Text c="dimmed">Select one or more practitioners</Text>

            {/* MultiResourceInput dedupes by reference string, so a practitioner can only be added once. */}
            <MultiResourceInput<Practitioner>
              resourceType="Practitioner"
              name="practitioners"
              defaultValue={initialPractitioners}
              onChange={(resources) => setPractitioners(resources.map((practitioner) => createReference(practitioner)))}
            />
          </Stack>

          <Stack gap={0}>
            <Text fw={500}>Topic (optional)</Text>
            <Text c="dimmed">Enter a topic for the message</Text>

            <TextInput placeholder="Enter your topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
          </Stack>

          <Divider pt="xs" />
        </Stack>

        <Box px="lg" pb="lg">
          <Button w="100%" onClick={handleSave} disabled={practitioners.length === 0}>
            Save
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
