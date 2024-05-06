import { Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getDisplayString, getQuestionnaireAnswers, getReferenceString, normalizeErrorString } from '@medplum/core';
import {
  Coding,
  Encounter,
  Patient,
  Practitioner,
  Questionnaire,
  QuestionnaireResponse,
  Reference,
} from '@medplum/fhirtypes';
import { QuestionnaireForm, useMedplum, useMedplumProfile } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

interface CreateEncounterProps {
  readonly opened: boolean;
  readonly handlers: {
    readonly open: () => void;
    readonly close: () => void;
    readonly toggle: () => void;
  };
}

export function CreateEncounter({ opened, handlers }: CreateEncounterProps): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile() as Practitioner;
  const navigate = useNavigate();

  function handleQuestionnaireSubmit(formData: QuestionnaireResponse): void {
    const answers = getQuestionnaireAnswers(formData);
    console.log(answers);
    const patientReference = answers['patient'].valueReference as Reference<Patient>;
    const encounterClass = answers['class'].valueCoding as Coding;
    const encounterType = answers['type']?.valueCoding ?? undefined;
    const encounterDate = answers['date'].valueDate as string;
    createEncounter(patientReference, encounterClass, encounterDate, encounterType);
    handlers.close();
  }

  function createEncounter(patient: Reference<Patient>, encounterClass: Coding, date: string, type?: Coding): void {
    const encounterData: Encounter = {
      resourceType: 'Encounter',
      subject: patient,
      class: encounterClass,
      status: 'in-progress',
      period: {
        start: date,
      },
      type: type
        ? [
            {
              coding: [type],
            },
          ]
        : undefined,
      participant: [
        {
          type: [
            {
              coding: [
                {
                  system: 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType',
                  code: 'ATND',
                  display: 'attender',
                },
              ],
            },
          ],
          individual: { reference: getReferenceString(profile), display: getDisplayString(profile) },
        },
      ],
    };

    medplum
      .createResource(encounterData)
      .then((encounter) => {
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Encounter created',
        });
        navigate(`/Encounter/${encounter.id}`);
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }

  return (
    <Modal opened={opened} onClose={handlers.close}>
      <p>Create an Encounter</p>
      <QuestionnaireForm questionnaire={createEncounterQuestionnaire} onSubmit={handleQuestionnaireSubmit} />
    </Modal>
  );
}

const createEncounterQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Create an Encounter',
  id: 'new-encounter',
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
      linkId: 'date',
      type: 'date',
      text: 'What is the date of the encounter?',
      required: true,
      initial: [
        {
          valueDate: new Date().toISOString().slice(0, 10),
        },
      ],
    },
    {
      linkId: 'class',
      type: 'choice',
      text: 'What is the encounter class?',
      required: true,
      answerValueSet: 'http://terminology.hl7.org/ValueSet/v3-ActEncounterCode',
    },
    {
      linkId: 'type',
      type: 'choice',
      text: 'What type of encounter is this?',
      answerValueSet: 'https://example.com/encounter-types',
    },
  ],
};
