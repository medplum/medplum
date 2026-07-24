// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Modal, Stack, Text } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Communication, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { ResourceInput } from '../../ResourceInput/ResourceInput';
import classes from './messageModalStyles.module.css';
import { showErrorNotification } from './notifications';
import { ThreadMessageFields } from './ThreadMessageFields';

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
    // The Next button is disabled until both are set; this guard also narrows `patient`.
    if (!patient || practitioners.length === 0) {
      return;
    }

    const communication: Communication = {
      resourceType: 'Communication',
      status: 'in-progress',
      subject: patient,
      sender: profileRef,
      recipient: [patient, ...practitioners],
      topic: topic ? { text: topic } : undefined,
    };

    try {
      const createdCommunication = await medplum.createResource(communication);
      onSubmit?.(createdCommunication);
      onClose();
    } catch (error) {
      showErrorNotification(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New Message" size="md" classNames={classes}>
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

          <ThreadMessageFields
            practitioners={initialPractitioners}
            onPractitionersChange={setPractitioners}
            topic={topic}
            onTopicChange={setTopic}
          />
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
