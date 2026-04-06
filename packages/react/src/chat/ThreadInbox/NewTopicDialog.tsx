// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, HTTP_HL7_ORG, normalizeErrorString } from '@medplum/core';
import type {
  Communication,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { QuestionnaireForm } from '../../QuestionnaireForm/QuestionnaireForm';
import { ResourceInput } from '../../ResourceInput/ResourceInput';

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

  const [topic, setTopic] = useState('');
  const [practitioners, setPractitioners] = useState(
    profile?.resourceType === 'Practitioner' ? [createReference(profile) as Reference<Practitioner>] : []
  );
  const [patient, setPatient] = useState<Reference<Patient> | undefined>(
    subject ? createReference(subject as Patient) : undefined
  );

  // Create initial QuestionnaireResponse with current practitioner as default
  const initialResponse: QuestionnaireResponse | undefined = useMemo(() => {
    if (profile?.resourceType === 'Practitioner') {
      return {
        resourceType: 'QuestionnaireResponse',
        status: 'in-progress',
        item: [
          {
            linkId: 'q1',
            answer: [{ valueReference: createReference(profile) as Reference<Practitioner> }],
          },
        ],
      };
    }
    return undefined;
  }, [profile]);

  const handleSubmit = async (): Promise<void> => {
    if (!patient) {
      showNotification({
        title: 'Error',
        message: 'Please select a patient',
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
    <Modal opened={opened} onClose={onClose} title="New Message" size="md">
      <Stack gap="xl">
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
              setPatient(value ? (createReference(value) as Reference<Patient>) : undefined);
            }}
          />
        </Stack>

        <Stack gap={0}>
          <Text fw={500}>Practitioner (optional)</Text>
          <Text c="dimmed">Select one or more practitioners</Text>

          <QuestionnaireForm
            questionnaire={questionnaire}
            questionnaireResponse={initialResponse}
            excludeButtons={true}
            onChange={(value: QuestionnaireResponse) => {
              const references =
                value.item?.[0].answer
                  ?.map((item) => item.valueReference)
                  .filter((ref): ref is Reference<Practitioner> => ref !== undefined) ?? [];
              setPractitioners(references);
            }}
          />
        </Stack>

        <Stack gap={0}>
          <Text fw={500}>Topic (optional)</Text>
          <Text c="dimmed">Enter a topic for the message</Text>

          <TextInput placeholder="Enter your topic" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Stack>

        <Button onClick={handleSubmit}>Next</Button>
      </Stack>
    </Modal>
  );
};

const questionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  item: [
    {
      linkId: 'q1',
      type: 'reference',
      repeats: true,
      extension: [
        {
          url: `${HTTP_HL7_ORG}/fhir/StructureDefinition/questionnaire-referenceResource`,
          valueCodeableConcept: {
            coding: [
              {
                system: `${HTTP_HL7_ORG}/fhir/fhir-types`,
                display: 'Practitioner',
                code: 'Practitioner',
              },
            ],
          },
        },
      ],
    },
  ],
};
