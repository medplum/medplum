// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, ProfileResource } from '@medplum/core';
import {
  Communication,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, ResourceInput, useMedplum, useMedplumProfile } from '@medplum/react';
import { JSX, useMemo, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

interface NewTopicDialogProps {
  subject: Reference<Patient> | Patient | undefined;
  opened: boolean;
  onClose: () => void;
  onSubmit?: (communication: Communication) => void;
}

export const NewTopicDialog = (props: NewTopicDialogProps): JSX.Element => {
  const { subject, opened, onClose, onSubmit } = props;
  const medplum = useMedplum();
  const [topic, setTopic] = useState('');
  const [practitioners, setPractitioners] = useState<Reference<Practitioner>[]>([]);
  const [patient, setPatient] = useState<Reference<Patient> | undefined>(
    subject ? createReference(subject as Patient) : undefined
  );
  const profile = useMedplumProfile();
  const profileRef = useMemo(() => (profile ? createReference(profile as ProfileResource) : undefined), [profile]);

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
      showErrorNotification(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New Message" size="md">
      <Stack gap="xl">
        <Stack gap={0}>
          <Text fw={500}>Patient</Text>
          <Text c="dimmed">Select a patient</Text>

          <ResourceInput
            resourceType="Patient"
            name="patient"
            required={true}
            defaultValue={patient}
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
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/fhir-types',
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
