import { Modal } from '@mantine/core';
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
  Slot,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface CreateAppointmentProps {
  patient?: Patient;
  slot: Slot;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateAppointment(props: CreateAppointmentProps): JSX.Element {
  const { patient, slot, opened, handlers } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

  // If a patient is provided, remove the patient question from the questionnaire
  if (patient) {
    createAppointmentQuestionnaire.item = createAppointmentQuestionnaire.item?.filter((i) => i.linkId !== 'patient');
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
        slot: [createReference(slot)],
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
      navigate(`/Appointment/${appointment.id}`);
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

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm questionnaire={createAppointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
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
