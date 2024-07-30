import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, getQuestionnaireAnswers, normalizeErrorString } from '@medplum/core';
import { Coding, Patient, Practitioner, Questionnaire, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';

interface CreateAppointmentProps {
  patient?: Patient;
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateAppointment(props: CreateAppointmentProps): JSX.Element {
  const { patient, opened, handlers } = props;
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;

  // If a patient is provided, remove the patient question from the questionnaire
  if (patient) {
    appointmentQuestionnaire.item = appointmentQuestionnaire.item?.filter((i) => i.linkId !== 'patient');
  }

  async function handleQuestionnaireSubmit(formData: QuestionnaireResponse): Promise<void> {
    const answers = getQuestionnaireAnswers(formData);

    // If a patient is provided to the component, use that patient, otherwise use the patient from the form
    const appointmentPatient = patient
      ? createReference(patient)
      : (answers['patient'].valueReference as Reference<Patient>);

    try {
      await medplum.createResource({
        resourceType: 'Appointment',
        status: 'booked',
        start: answers['start-date'].valueDateTime,
        end: answers['end-date'].valueDateTime,
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

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <QuestionnaireForm questionnaire={appointmentQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const appointmentQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Appointment',
  id: 'new-appointment',
  item: [
    {
      linkId: 'patient',
      type: 'reference',
      text: 'Which patient is the subject of this encounter?',
      required: true,
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
    {
      linkId: 'service-type',
      type: 'choice',
      text: 'What is the appointment service type?',
      answerValueSet: 'http://hl7.org/fhir/ValueSet/service-type',
      required: true,
    },
  ],
};
