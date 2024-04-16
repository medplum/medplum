import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString, parseReference } from '@medplum/core';
import {
  Communication,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { getRecipients, checkForInvalidRecipient } from '../../utils';

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

  function onQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const participants = getRecipients(formData) as QuestionnaireResponseItemAnswer[];
    const answers = getQuestionnaireAnswers(formData);
    const topic = answers.topic.valueString as string;
    const subject = answers.subject?.valueReference as Reference<Patient>;

    if (subject && parseReference(subject)[0] !== 'Patient') {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: 'The subject of a thread must be a patient',
      });
      throw new Error('The subject of a thread must be a patient');
    }

    handleCreateThread(topic, participants, subject).catch(console.error);
    handlers.close();
  }

  async function handleCreateThread(
    topic: string,
    participants: QuestionnaireResponseItemAnswer[],
    subject?: Reference<Patient>
  ): Promise<void> {
    // The suggested way to handle threads is by including all participants in the `recipients` field. This gets all people that are a entered as a recipient
    const profileReference = createReference(profile);

    const recipients = participants
      ?.filter((participant) => participant.valueReference?.reference !== profileReference.reference)
      .map((participant) => participant.valueReference) as Communication['recipient'];

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
      sender: profileReference,
    };

    if (subject) {
      thread.subject = subject;
    }

    try {
      // Create the thread
      const result = await medplum.createResource(thread);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Thread created',
      });
      navigate(`/Communication/${result.id}`);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm questionnaire={createThreadQuestionnaire} onSubmit={onQuestionnaireSubmit} />
    </Modal>
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
    {
      linkId: 'category',
      type: 'choice',
      text: 'Thread Category',
      answerValueSet: 'https://example.org/thread-categories',
    },
    {
      linkId: 'subject',
      type: 'reference',
      text: 'Select a patient that is the subject of this thread (Optional)',
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                code: 'Patient',
              },
            ],
          },
        },
      ],
    },
  ],
};
