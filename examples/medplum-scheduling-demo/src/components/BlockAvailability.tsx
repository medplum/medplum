import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, createReference, normalizeErrorString } from '@medplum/core';
import { QuestionnaireResponse, Schedule, Questionnaire } from '@medplum/fhirtypes';
import { useMedplum, Loading, QuestionnaireForm } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useContext } from 'react';
import { ScheduleContext } from '../Schedule.context';
import { BlockAvailabilityEvent } from '../bots/core/block-availability';

interface BlockAvailabilityProps {
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function BlockAvailability(props: BlockAvailabilityProps): JSX.Element {
  const { opened, handlers } = props;

  const medplum = useMedplum();

  const { schedule } = useContext(ScheduleContext);

  if (!schedule) {
    return <Loading />;
  }

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    try {
      const input: BlockAvailabilityEvent = {
        schedule: createReference(schedule as Schedule),
        start: answers['start-date'].valueDateTime as string,
        end: answers['end-date'].valueDateTime as string,
      };
      await medplum.executeBot({ system: 'http://example.com', value: 'block-availability' }, input);

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Slots created',
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

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm
        questionnaire={blockAvailabilityQuestionnaire}
        subject={createReference(schedule)}
        onSubmit={handleQuestionnaireSubmit}
      />
    </Modal>
  );
}

const blockAvailabilityQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Block Availability',
  id: 'block-availability',
  item: [
    {
      linkId: 'start-date',
      type: 'dateTime',
      text: 'Start Date',
      required: true,
    },
    {
      linkId: 'end-date',
      type: 'dateTime',
      text: 'End Date',
      required: true,
    },
  ],
};
