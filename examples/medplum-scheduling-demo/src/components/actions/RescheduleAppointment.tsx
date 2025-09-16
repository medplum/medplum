// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Appointment, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate } from 'react-router';

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
      const startDateTime = answers['start-date'].valueDateTime as string;
      const endDateTime = answers['end-date'].valueDateTime as string;

      // Update the appointment and the slot with the new start and end dates, and change the status
      const slotId = appointment?.slot?.[0].reference?.split('Slot/')[1];
      if (slotId) {
        const slot = await medplum.readResource('Slot', slotId);
        await medplum.updateResource({
          ...slot,
          start: startDateTime,
          end: endDateTime,
          status: 'busy',
        });
      }
      await medplum.updateResource({
        ...appointment,
        start: startDateTime,
        end: endDateTime,
        status: 'booked',
      });

      navigate(`/Appointment/${appointment.id}/details`)?.catch(console.error);
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
      <QuestionnaireForm questionnaire={rescheduleAppointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const rescheduleAppointmentQuestionnaire: Questionnaire = {
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
