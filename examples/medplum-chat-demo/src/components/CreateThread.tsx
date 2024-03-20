import { Button, Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString, parseReference } from '@medplum/core';
import {
  Communication,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface CreateThreadProps {
  opened: boolean;
  handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateThread({ opened, handlers }: CreateThreadProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

  const handleCreateThread = async (formData: QuestionnaireResponse): Promise<void> => {
    const answers = getQuestionnaireAnswers(formData);
    const topic = answers.topic.valueString;
    const participants = answers.participants.valueReference;
    const recipients = [participants] as Communication['recipient'];
    const profileReference = createReference(profile);
    let subject;

    if (recipients?.length === 1 && parseReference(recipients[0])[0] === 'Patient') {
      subject = recipients[0] as Reference<Patient>;
    }

    recipients?.push(profileReference);

    if (!topic || !participants) {
      throw new Error('Please ensure a valid input.');
    }

    const thread: Communication = {
      resourceType: 'Communication',
      status: 'in-progress',
      topic: {
        coding: [
          {
            display: topic,
          },
        ],
      },
      recipient: recipients,
      subject,
    };

    try {
      const result = await medplum.createResource(thread);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Thread created',
      });
      handlers.close();
      navigate(`/Communication/${result.id}`);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  return (
    <div>
      <Button onClick={handlers.open}>Create New Thread</Button>
      <Modal opened={opened} onClose={handlers.close}>
        <QuestionnaireForm questionnaire={createThreadQuestionnaire} onSubmit={handleCreateThread} />
      </Modal>
    </div>
  );
}

const createThreadQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Start a New Thread',
  id: 'new-thread',
  item: [
    {
      linkId: 'topic',
      type: 'string',
      text: 'Thread Topic:',
      required: true,
    },
    {
      linkId: 'participants',
      type: 'reference',
      text: 'Add thread participants:',
      repeats: true,
      required: true,
    },
  ],
};
