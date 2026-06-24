// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Divider, Modal, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { MultiResourceInput } from '../../ResourceInput/MultiResourceInput';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import { MESSAGE_MODAL_STYLES } from './messageModalStyles';

/**
 * Props for the NewTopicDialog component.
 * @param subject - The patient to associate with the new thread. When provided and `allowPatientSelection` is false, the patient field is pre-filled and disabled.
 * @param opened - Whether the dialog is open.
 * @param onClose - Callback fired when the dialog is closed.
 * @param onSubmit - Callback fired with the created Communication resource after successful submission.
 * @param allowPatientSelection - When true, the patient field is an editable search input. When false (default), the field is pre-filled from `subject` and disabled. Use true for provider-facing contexts, false for patient-facing apps.
 */
export interface NewTopicDialogProps {
  subject: Reference<Patient> | Patient | undefined;
  opened: boolean;
  onClose: () => void;
  onSubmit?: (communication: Communication) => void;
  allowPatientSelection?: boolean;
}

export const NewTopicDialog = (props: NewTopicDialogProps): JSX.Element => {
  const { subject, opened, onClose, onSubmit, allowPatientSelection = false } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile();
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);

  // Default the signed-in provider as the first practitioner recipient.
  const initialPractitioners = useMemo<Reference<Practitioner>[]>(
    () => (profile?.resourceType === 'Practitioner' ? [createReference(profile)] : []),
    [profile]
  );

  const [topic, setTopic] = useState('');
  const [practitioners, setPractitioners] = useState<Reference<Practitioner>[]>(initialPractitioners);
  const [patient, setPatient] = useState<Reference<Patient> | undefined>(
    subject ? createReference(subject as Patient) : undefined
  );

  const handleSubmit = async (): Promise<void> => {
    if (!patient) {
      showNotification({
        title: 'Error',
        message: 'Please select a patient',
        color: 'red',
      });
      return;
    }

    if (practitioners.length === 0) {
      showNotification({
        title: 'Error',
        message: 'Please select at least one practitioner',
        color: 'red',
      });
      return;
    }

    const communication: Communication = {
      resourceType: 'Communication',
      status: 'in-progress',
      subject: patient,
      sender: profileRef,
      recipient: [
        patient,
        ...practitioners.map((practitioner) => ({
          reference: practitioner.reference,
        })),
      ],
      topic: {
        text: topic,
      },
    };

    try {
      const createdCommunication = await medplum.createResource(communication);
      onSubmit?.(createdCommunication);
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
    <Modal opened={opened} onClose={onClose} title="New Message" size="md" styles={MESSAGE_MODAL_STYLES}>
      <Stack gap={0}>
        <Stack gap="lg" p="lg">
          <Stack gap={0}>
            <Text fw={500}>Patient</Text>
            {allowPatientSelection && <Text c="dimmed">Select a patient</Text>}

            <ResourceInput
              resourceType="Patient"
              name="patient"
              required={true}
              defaultValue={patient}
              disabled={!allowPatientSelection && !!patient}
              onChange={(value) => {
                setPatient(value ? createReference(value) : undefined);
              }}
            />
          </Stack>

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

          <Box pt="xs">
            <Divider />
          </Box>
        </Stack>

        <Box px="lg" pb="lg">
          <Button w="100%" onClick={handleSubmit} disabled={!patient || practitioners.length === 0}>
            Next
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
