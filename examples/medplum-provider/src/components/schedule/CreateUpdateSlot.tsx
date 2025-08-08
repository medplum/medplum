// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Questionnaire, QuestionnaireItem, QuestionnaireResponse, Reference, Schedule, Slot } from '@medplum/fhirtypes';
import { Loading, QuestionnaireForm, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { Event } from 'react-big-calendar';

interface CreateUpdateSlotProps {
  readonly schedule: Schedule;
  readonly event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
  readonly onSlotsUpdated: () => void;
}

/**
 * CreateUpdateSlot component that allows the user to create or update a slot.
 * @param props - CreateUpdateSlotProps
 * @returns A React component that displays the modal.
 */
export function CreateUpdateSlot(props: CreateUpdateSlotProps): JSX.Element {
  const { schedule, event, opened, handlers, onSlotsUpdated } = props;
  const medplum = useMedplum();

  const editingSlot: Slot = event?.resource;

  if (!schedule) {
    return <Loading />;
  }

  // If an editing slot was passed, update it otherwise create a new slot
  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);
    const status = answers['status']?.valueCoding?.code as 'free' | 'busy-unavailable';
    const start = answers['start-date'].valueDateTime as string;
    const end = answers['end-date'].valueDateTime as string;
    const scheduleReference = formData.subject as Reference<Schedule>;

    try {
      if (editingSlot) {
        // Edit existing slot
        await medplum.updateResource({
          ...editingSlot,
          start,
          end,
        });
      } else if (status === 'busy-unavailable') {
        // Create new slot and block availability
        const input = {
          schedule: scheduleReference,
          start,
          end,
        };
        await medplum.executeBot({ system: 'http://example.com', value: 'block-availability' }, input);
      } else if (status === 'free') {
        // Create new slot
        await medplum.createResource({
          resourceType: 'Slot',
          schedule: scheduleReference,
          start,
          end,
          status,
        });
      }

      onSlotsUpdated();
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

  const slotQuestionnaire: Questionnaire = {
    resourceType: 'Questionnaire',
    status: 'active',
    title: editingSlot ? 'Update Slot' : 'Create a Slot',
    id: 'new-slot',
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
    (slotQuestionnaire.item as QuestionnaireItem[]).unshift({
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
      <QuestionnaireForm
        questionnaire={slotQuestionnaire}
        subject={createReference(schedule)}
        onSubmit={handleQuestionnaireSubmit}
      />
    </Modal>
  );
}
