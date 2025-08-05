// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Modal } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import {
  Appointment,
  Coding,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
  Schedule,
  Slot,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff, IconEdit, IconTrash } from '@tabler/icons-react';
import { JSX } from 'react';
import { Event } from 'react-big-calendar';
import { useNavigate } from 'react-router';
import { CreateUpdateSlot } from './CreateUpdateSlot';

interface CreateAppointmentProps {
  readonly schedule: Schedule;
  readonly patient?: Patient;
  readonly event: Event | undefined;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
  readonly onAppointmentsUpdated: () => void;
}

/**
 * CreateAppointment component that allows the user to create an appointment from a slot.
 * @param props - CreateAppointmentProps
 * @returns A React component that displays the modal.
 */
export function CreateAppointment(props: CreateAppointmentProps): JSX.Element | null {
  const { schedule, patient, event, opened, handlers, onAppointmentsUpdated } = props;
  const slot: Slot | undefined = event?.resource;

  const [updateSlotOpened, updateSlotHandlers] = useDisclosure(false, { onClose: handlers.close });
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

  // If a patient is provided, remove the patient question from the questionnaire
  if (patient) {
    createAppointmentQuestionnaire.item = createAppointmentQuestionnaire.item?.filter((i) => i.linkId !== 'patient');
  }

  async function handleDeleteSlot(slotId: string): Promise<void> {
    try {
      await medplum.deleteResource('Slot', slotId);
      onAppointmentsUpdated();
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

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    // If a patient is provided to the component, use that patient, otherwise use the patient from the form
    const appointmentPatient = patient
      ? createReference(patient)
      : (answers['patient'].valueReference as Reference<Patient>);

    try {
      let appointment: Appointment = {
        resourceType: 'Appointment',
        status: 'booked',
        slot: [createReference(slot as Slot)],
        appointmentType: { coding: [answers['appointment-type'].valueCoding as Coding] },
        serviceType: [{ coding: [answers['service-type'].valueCoding as Coding] }],
        participant: [
          {
            actor: appointmentPatient,
            status: 'accepted',
          },
          {
            actor: createReference(profile),
            status: 'accepted',
          },
        ],
        comment: answers['comment']?.valueString,
      };
      // Call bot to create the appointment
      appointment = await medplum.executeBot({ system: 'http://example.com', value: 'book-appointment' }, appointment);

      // Navigate to the appointment detail page
      navigate(`/Appointment/${appointment.id}`)?.catch(console.error);
      onAppointmentsUpdated();
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Appointment created',
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

  if (!slot) {
    return null;
  }

  return (
    <>
      <Modal
        opened={opened}
        onClose={handlers.close}
        title={
          <Group>
            <Button
              variant="subtle"
              size="compact-md"
              leftSection={<IconEdit size={16} />}
              onClick={() => {
                handlers.close();
                updateSlotHandlers.open();
              }}
            >
              Edit
            </Button>
            <Button
              variant="subtle"
              size="compact-md"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={() => handleDeleteSlot(slot.id as string)}
            >
              Delete
            </Button>
          </Group>
        }
      >
        <QuestionnaireForm questionnaire={createAppointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
      </Modal>

      <CreateUpdateSlot
        schedule={schedule}
        event={event}
        opened={updateSlotOpened}
        handlers={updateSlotHandlers}
        onSlotsUpdated={onAppointmentsUpdated}
      />
    </>
  );
}

const createAppointmentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Appointment',
  id: 'new-appointment',
  item: [
    {
      linkId: 'patient',
      type: 'reference',
      text: 'Patient',
      required: true,
      extension: [
        {
          url: 'http://hl7.org/fhir/StructureDefinition/questionnaire-referenceResource',
          valueCodeableConcept: {
            coding: [
              {
                system: 'http://hl7.org/fhir/fhir-types',
                code: 'Patient',
                display: 'Patient',
              },
            ],
          },
        },
      ],
    },
    {
      linkId: 'appointment-type',
      type: 'choice',
      text: 'Appointment Type',
      answerValueSet: 'http://terminology.hl7.org/ValueSet/v2-0276',
      required: true,
    },
    {
      linkId: 'service-type',
      type: 'choice',
      text: 'Appointment Service Type',
      answerValueSet: 'http://example.com/appointment-service-types',
      required: true,
    },
    {
      linkId: 'comment',
      type: 'string',
      text: 'Additional Comments',
    },
  ],
};
