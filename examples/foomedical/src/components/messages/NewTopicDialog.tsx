// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Modal, Stack, Text, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type {
  Communication,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { showErrorNotification } from '../../utils/notifications';

interface NewTopicDialogProps {
  opened: boolean;
  onClose: () => void;
  onSubmit?: (communication: Communication) => void;
}

export const NewTopicDialog = (props: NewTopicDialogProps): JSX.Element => {
  const { opened, onClose, onSubmit } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Patient;
  const profileRef = useMemo(() => (profile ? createReference(profile) : undefined), [profile]);

  const [topic, setTopic] = useState('');
  const [practitioners, setPractitioners] = useState<Reference<Practitioner>[]>([]);

  // Create initial QuestionnaireResponse (empty - patient doesn't pre-populate practitioners)
  const initialResponse: QuestionnaireResponse | undefined = useMemo(() => {
    return {
      resourceType: 'QuestionnaireResponse',
      status: 'in-progress',
      item: [
        {
          linkId: 'q1',
          answer: [],
        },
      ],
    };
  }, []);

  const handleSubmit = async (): Promise<void> => {
    if (!profileRef) {
      showErrorNotification(new Error('Patient profile not found'));
      return;
    }

    const communication: Communication = {
      resourceType: 'Communication',
      status: 'in-progress',
      subject: profileRef as Reference<Patient>,
      sender: profileRef,
      recipient: [
        profileRef as Reference<Patient>,
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
      setTopic('');
      setPractitioners([]);
    } catch (error) {
      showErrorNotification(error);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="New Message" size="md">
      <Stack gap="xl">
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
