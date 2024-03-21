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
import { getRecipients, checkForInvalidRecipient } from '../utils';

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
    // The suggested way to handle threads is by including all participants in the `recipients` field. This gets all people that are a entered as a recipient
    const participants = getRecipients(formData);
    const topic = getQuestionnaireAnswers(formData)['topic'].valueString;
    const profileReference = createReference(profile);
    let subject;

    const recipients = participants?.map((participant) => participant.valueReference) as Communication['recipient'];

    if (!topic || !recipients) {
      throw new Error('Please ensure a valid input.');
    }

    const invalidRecipients = checkForInvalidRecipient(recipients);

    if (invalidRecipients) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'Invalid recipient type',
      });
      throw new Error('Invalid recipient type');
    }

    // If there a single patient in the recipient threads, set that patient as the subject of the thread.
    if (recipients?.length === 1 && parseReference(recipients[0])[0] === 'Patient') {
      subject = recipients[0] as Reference<Patient>;
    }

    // Add the user that created the trhead as a participant
    recipients?.push(profileReference);

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
      // Create the thread
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
