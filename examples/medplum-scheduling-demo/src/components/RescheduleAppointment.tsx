import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Appointment, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface RescheduleAppointmentProps {
  appointment: Appointment;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function RescheduleAppointment(props: RescheduleAppointmentProps): JSX.Element {
  const { appointment, opened, handlers } = props;
  const medplum = useMedplum();
  const navigate = useNavigate();

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    try {
      // Update the appointment with the new start and end dates, and change the status to "booked"
      await medplum.updateResource({
        ...appointment,
        start: answers['start-date'].valueDateTime,
        end: answers['end-date'].valueDateTime,
        status: 'booked',
      });

      navigate(`/Appointment/${appointment.id}/details`);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Appointment rescheduled',
      });
      handlers.close();
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
      <p>Reschedule Appointment</p>
      <QuestionnaireForm questionnaire={rescheduleQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const rescheduleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  id: 'reschedule-appointment',
  title: 'Reschedule Appointment',
  status: 'active',
  item: [
    {
      linkId: 'start-date',
      type: 'dateTime',
      text: 'Start date',
      required: true,
    },
    {
      linkId: 'end-date',
      type: 'dateTime',
      text: 'End date',
      required: true,
    },
  ],
};
