import { PROPERTY_TYPES } from '@babel/types';
import { Button, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { getQuestionnaireAnswers, PatchOperation } from '@medplum/core';
import { CodeableConcept, Communication, Questionnaire, QuestionnaireResponse, Resource } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';

interface EditTopicThreadProps {
  readonly communication: Communication;
  readonly onChange: (communication: Communication) => void;
}

export function EditThreadTopic({ communication, onChange }: EditTopicThreadProps): JSX.Element {
  const medplum = useMedplum();
  const [opened, handlers] = useDisclosure(false);

  const onQuestionnaireSubmit = (formData: QuestionnaireResponse) => {
    const newTopic = getQuestionnaireAnswers(formData)['edit-topic'].valueString;
    console.log(newTopic);

    if (!newTopic) {
      throw new Error('Please enter a new topic');
    }

    handleTopicUpdate(newTopic);
    handlers.close();
  };

  const handleTopicUpdate = async (newTopic: string) => {
    const communicationId = communication.id as string;
    const topicCodeable: CodeableConcept = {
      coding: [
        {
          display: newTopic,
        },
      ],
    };

    const ops: PatchOperation[] = [
      { op: 'test', path: '/meta/versionId', value: communication.meta?.versionId },
      { op: communication.topic ? 'replace' : 'add', path: '/topic', value: topicCodeable },
    ];

    try {
      const result = await medplum.patchResource(communication.resourceType, communicationId, ops);
      console.log('Success!');
      onChange(result);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <Button fullWidth onClick={handlers.toggle}>
        Edit Topic
      </Button>
      <Modal opened={opened} onClose={handlers.close} title="Edit Topic">
        <QuestionnaireForm questionnaire={editTopicQuestionnaire} onSubmit={onQuestionnaireSubmit} />
      </Modal>
    </div>
  );
}

const editTopicQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  id: 'edit-thread-topic',
  item: [
    {
      linkId: 'edit-topic',
      type: 'string',
      text: 'Edit Thread Topic',
      required: true,
    },
  ],
};
