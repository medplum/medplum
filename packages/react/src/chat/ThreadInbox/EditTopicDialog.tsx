// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Group, Loader, Modal, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import { MESSAGE_MODAL_STYLES } from './messageModalStyles';

/**
 * Props for the EditTopicDialog component.
 * @param thread - The thread (root Communication) to edit.
 * @param opened - Whether the dialog is open.
 * @param onClose - Callback fired when the dialog is closed.
 * @param onSaved - Callback fired with the updated Communication resource after a successful save.
 */
export interface EditTopicDialogProps {
  thread: Communication;
  opened: boolean;
  onClose: () => void;
  onSaved?: (communication: Communication) => void;
}

export const EditTopicDialog = (props: EditTopicDialogProps): JSX.Element => {
  const { thread, opened, onClose, onSaved } = props;
  const medplum = useMedplum();

  const patientRef = thread.subject as Reference<Patient> | undefined;

  // Existing practitioner recipients, identified by the "Practitioner/" reference prefix
  // (the patient subject and any other recipient types are excluded).
  const initialPractitioners = useMemo(() => {
    const fromRecipients = (thread.recipient ?? []).filter((r): r is Reference<Practitioner> =>
      Boolean(r.reference?.startsWith('Practitioner/'))
    );
    if (fromRecipients.length > 0) {
      return fromRecipients;
    }
    // Fallback for threads with no practitioner recipient (e.g. legacy/patient-only threads):
    // surface the sender when it is a Practitioner, so the field isn't empty. Saving then
    // migrates this practitioner into the recipient list.
    const sender = thread.sender;
    if (sender?.reference?.startsWith('Practitioner/')) {
      return [sender as Reference<Practitioner>];
    }
    return [];
  }, [thread.recipient, thread.sender]);

  // Resolve every reference (patient subject + practitioner recipients) in parallel before
  // rendering any field. Each ResourceInput/MultiResourceInput otherwise resolves its own
  // defaultValue on its own timeline, so a cached field renders instantly while an uncached
  // one (typically the patient) pops in late. Gating on a single Promise.all makes all fields
  // appear together, fed pre-resolved resources so they have no further reads to do.
  const [resolved, setResolved] = useState<{ patient?: Patient; practitioners: Practitioner[] } | undefined>(
    undefined
  );

  useEffect(() => {
    let cancelled = false;
    // A failed patient read (deleted/inaccessible subject) must not blank the practitioner
    // list too, so resolve it independently and degrade to "no patient field" on failure.
    const patientPromise = patientRef
      ? medplum.readReference(patientRef).catch(() => undefined)
      : Promise.resolve(undefined);
    const practitionerPromises = initialPractitioners.map((ref) => medplum.readReference(ref));

    Promise.all([patientPromise, Promise.allSettled(practitionerPromises)])
      .then(([patient, settledPractitioners]) => {
        if (cancelled) {
          return;
        }
        setResolved({
          patient,
          practitioners: settledPractitioners
            .filter((r): r is PromiseFulfilledResult<Practitioner> => r.status === 'fulfilled')
            .map((r) => r.value),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setResolved({ practitioners: [] });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [medplum, patientRef, initialPractitioners]);

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
      recipient: [
        ...preservedRecipients,
        ...practitioners.map((practitioner) => ({
          reference: practitioner.reference,
        })),
      ],
      topic: { text: topic },
    };

    try {
      const saved = await medplum.updateResource(updated);
      onSaved?.(saved);
      onClose();
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Message Settings" size="md" styles={MESSAGE_MODAL_STYLES}>
      {/* Hold the form until every reference is resolved so all fields appear together,
          rather than each input popping in as its own read completes. */}
      {!resolved ? (
        <Group justify="center" p="xl">
          <Loader size="sm" />
        </Group>
      ) : (
        <Stack gap={0}>
          <Stack gap="lg" p="lg">
            {/* Only show the patient when the thread has a subject. The patient cannot be changed
                or added after creation, so practitioner-only threads omit this field entirely. */}
            {resolved.patient && (
              <Stack gap={0}>
                <Text fw={500}>Patient</Text>

                <ResourceInput resourceType="Patient" name="patient" defaultValue={resolved.patient} disabled={true} />
              </Stack>
            )}

            <Stack gap={0}>
              <Text fw={500}>Practitioner</Text>
              <Text c="dimmed">Select one or more practitioners</Text>

              {/* MultiResourceInput dedupes by reference string, so a practitioner can only be added once. */}
              <MultiResourceInput<Practitioner>
                resourceType="Practitioner"
                name="practitioners"
                defaultValue={resolved.practitioners}
                onChange={(resources) =>
                  setPractitioners(resources.map((practitioner) => createReference(practitioner)))
                }
              />
            </Stack>

            <Stack gap={0}>
              <Text fw={500}>Topic (optional)</Text>
              <Text c="dimmed">Enter a topic for the message</Text>

              <TextInput placeholder="Enter your topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
            </Stack>

            <Box pt="xs">
              <Divider />
            </Box>
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
