import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getQuestionnaireAnswers, PatchOperation } from '@medplum/core';
import { Communication, Questionnaire, QuestionnaireResponse, Reference, Resource } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';

interface AddParticipantProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function AddParticipant(props: AddParticipantProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse) => {
    const newParticipant = getQuestionnaireAnswers(formData)['add-participant']
      .valueReference as Communication['recipient'];
    console.log(newParticipant);
    if (!newParticipant) {
      throw new Error('Please select a valid person to add to this thread.');
    }

    handleNewParticipant(newParticipant);
    handlers.close();
  };

  const handleNewParticipant = async (newParticipant: Communication['recipient']) => {
    if (!newParticipant) {
      return;
    }

    const communicationId = props.communication.id as string;
    const currentParticipants = props.communication.recipient ?? [];

    const op = currentParticipants.length === 0 ? 'add' : 'replace';

    const updatedParticipants = currentParticipants.concat(newParticipant);

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: props.communication.meta?.versionId },
      { op, path: '/recipient', value: updatedParticipants },
    ];

    try {
      const result = await medplum.patchResource('Communication', communicationId, ops);
      console.log('Success!');
      props.onChange(result);
    } catch (err) {
      console.error(err);
    }
  };

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
      linkId: 'add-participant',
      type: 'reference',
      text: 'Add someone to this thread:',
    },
  ],
};
