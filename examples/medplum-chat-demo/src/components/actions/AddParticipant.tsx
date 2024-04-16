import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, PatchOperation } from '@medplum/core';
import { Communication, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { checkForInvalidRecipient, getRecipients } from '../../utils';

interface AddParticipantProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function AddParticipant(props: AddParticipantProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  function onQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const newParticipantsData = getRecipients(formData);
    if (!newParticipantsData) {
      throw new Error('Please select a valid person to add to this thread.');
    }
    const newParticipants = newParticipantsData?.map(
      (participant) => participant.valueReference
    ) as Communication['recipient'];

    if (!newParticipants) {
      throw new Error('Please select a valid person to add to this thread.');
    }

    const invalidRecipients = checkForInvalidRecipient(newParticipants);

    if (invalidRecipients) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Invalid recipient type',
      });
      throw new Error('Invalid recipient type');
    }

    addNewParticipant(newParticipants).catch(console.error);
    handlers.close();
  }

  async function addNewParticipant(newParticipant: Communication['recipient']): Promise<void> {
    if (!newParticipant) {
      return;
    }

    // Get the communication id and the participants that are already a part of the thread
    const communicationId = props.communication.id as string;
    const currentParticipants = props.communication.recipient ?? [];

    // If there are no participants, we will add a participant array, otherwise we will replace the current one with an udpated version.
    const op = currentParticipants.length === 0 ? 'add' : 'replace';

    // Add the new participants to the array
    const updatedParticipants = currentParticipants.concat(newParticipant);

    const ops: PatchOperation[] = [
      // Test to prevent race conditions
      { op: 'test', path: '/meta/versionId', value: props.communication.meta?.versionId },
      { op, path: '/recipient', value: updatedParticipants },
    ];

    try {
      // Patch the thread with the updated participants
      const result = await medplum.patchResource('Communication', communicationId, ops);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'User added to thread.',
      });
      props.onChange(result);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <div>
      <Button fullWidth onClick={handlers.toggle}>
        Add Participant(s)
      </Button>
      <Modal opened={opened} onClose={handlers.close} title="Add Participant(s)">
        <QuestionnaireForm questionnaire={addParticipantQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const addParticipantQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'add-participant',
  item: [
    {
      linkId: 'participants',
      type: 'reference',
      text: 'Add someone to this thread:',
      repeats: true,
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                code: 'Patient',
              },
              {
                code: 'Practitioner',
              },
              {
                code: 'RelatedPerson',
              },
            ],
          },
        },
      ],
    },
  ],
};
