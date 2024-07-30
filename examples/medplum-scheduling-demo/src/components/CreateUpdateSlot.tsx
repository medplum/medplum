import { Button, Modal } from '@mantine/core';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { Event } from 'react-big-calendar';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { ScheduleContext } from '../Schedule.context';
import { useContext } from 'react';
import { showNotification } from '@mantine/notifications';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CreateUpdateSlotProps {
  event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateUpdateSlot(props: CreateUpdateSlotProps): JSX.Element {
  const { event, opened, handlers } = props;
  const medplum = useMedplum();
  const { schedule } = useContext(ScheduleContext);

  const editingSlot: Slot = event?.resource;

  if (!schedule) {
    return <Loading />;
  }

  // If an editing slot was passed, update it otherwise create a new slot
  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    try {
      if (!editingSlot) {
        // Create new slot
        await medplum.createResource({
          resourceType: 'Slot',
          status: answers['status']?.valueCoding?.code as 'free' | 'busy-unavailable',
          start: answers['start-date'].valueDateTime as string,
          end: answers['end-date'].valueDateTime as string,
          schedule: formData.subject as Reference<Schedule>,
        });
      } else {
        // Edit the existing slot
        await medplum.updateResource({
          ...editingSlot,
          start: answers['start-date'].valueDateTime as string,
          end: answers['end-date'].valueDateTime as string,
        });
      }

      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: editingSlot ? 'Slot updated' : 'Slot created',
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

  // Handles deleting the slot
  async function handleDeleteSlot(): Promise<void> {
    try {
      await medplum.deleteResource('Slot', editingSlot.id as string);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Slot deleted',
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
    title: editingSlot ? 'Update Slot' : 'Create a Slot',
    id: 'new-appointment',
    item: [
      {
        linkId: 'start-date',
        type: 'dateTime',
        text: 'Start date',
        required: true,
        initial: [{ valueDateTime: event?.start?.toISOString() }],
      },
      {
        linkId: 'end-date',
        type: 'dateTime',
        text: 'End date',
        required: true,
        initial: [{ valueDateTime: event?.end?.toISOString() }],
      },
    ],
  };

  // If creating a Slot add a field to select the status
  if (!editingSlot) {
    (appointmentQuestionnaire.item as QuestionnaireItem[]).unshift({
      linkId: 'status',
      type: 'choice',
      answerOption: [
        { valueCoding: { code: 'free', display: 'Available' } },
        { valueCoding: { code: 'busy-unavailable', display: 'Block' } },
      ],
      required: true,
      initial: [{ valueCoding: { code: 'free', display: 'Available' } }],
    });
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      {editingSlot ? (
        <Button onClick={handleDeleteSlot} fullWidth color="red">
          Delete Slot
        </Button>
      ) : null}
      <QuestionnaireForm
        questionnaire={appointmentQuestionnaire}
        subject={createReference(schedule)}
        onSubmit={handleQuestionnaireSubmit}
      />
    </Modal>
  );
}
