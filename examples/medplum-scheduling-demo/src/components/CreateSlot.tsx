import { Modal } from '@mantine/core';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Questionnaire, QuestionnaireResponse, Schedule } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { ScheduleContext } from '../Schedule.context';
import { useContext } from 'react';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CreateSlotProps {
  start?: string | undefined;
  end?: string | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateSlot(props: CreateSlotProps): JSX.Element {
  const { start, end, opened, handlers } = props;
  const medplum = useMedplum();
  const { schedule } = useContext(ScheduleContext);

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    if (!schedule) {
      return;
    }

    const answers = getQuestionnaireAnswers(formData);

    try {
      await medplum.createResource({
        resourceType: 'Slot',
        status: 'free',
        start: answers['start-date'].valueDateTime as string,
        end: answers['end-date'].valueDateTime as string,
        schedule: createReference(schedule as Schedule),
      });

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Slot created',
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }

    handlers.close();
  }

  const appointmentQuestionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    status: 'active',
    title: 'Create a Slot',
    id: 'new-appointment',
    item: [
      {
        linkId: 'start-date',
        type: 'dateTime',
        text: 'Start date',
        required: true,
        initial: [{ valueDateTime: start }],
      },
      {
        linkId: 'end-date',
        type: 'dateTime',
        text: 'End date',
        required: true,
        initial: [{ valueDateTime: end }],
      },
    ],
  };

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <p>Create a Slot</p>
      <QuestionnaireForm questionnaire={appointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}
