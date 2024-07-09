import {
  BotEvent,
  createReference,
  getExtension,
  getQuestionnaireAnswers,
  getReferenceString,
  MedplumClient,
  resolveId,
} from '@medplum/core';
import { Coding, Extension, HumanName, Observation, Patient, QuestionnaireResponse } from '@medplum/fhirtypes';

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<void> {
  const response = event.input;
  const answers = getQuestionnaireAnswers(response);

  if (!response.subject) {
    return;
  }

  const patient = await medplum.readResource('Patient', resolveId(response.subject) as string);

  if (!patient) {
    return;
  }

  const newName = {
    given: [answers['first-name'].valueString, answers['middle-name'].valueString],
    family: answers['last-name'].valueString,
  } as HumanName;

  patient.name = [newName];
  patient.birthDate = answers['dob'].valueDate;
  patient.gender = answers['gender-identity'].valueCoding?.code as Patient['gender'];

  setPatientExtension(patient, answers['race'].valueCoding);
  setPatientExtension(patient, answers['ethnicity'].valueCoding);

  await medplum.updateResource(patient);

  const sexualOrientationValueCoding = answers['sexual-orientation'].valueCoding;
  if (sexualOrientationValueCoding) {
    await medplum.upsertResource(getSexualOrientationObservation(patient, sexualOrientationValueCoding), {
      code: '76690-7',
      subject: getReferenceString(patient),
    });
  }
}

function getSexualOrientationObservation(patient: Patient, valueCoding: Coding): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    valueCodeableConcept: {
      coding: [valueCoding],
    },
    code: {
      coding: [
        {
          system: 'http://loinc.org',
          code: '76690-7',
          display: 'Sexual orientation',
        },
      ],
      text: 'Sexual orientation',
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'social-history',
            display: 'Social History',
          },
        ],
      },
    ],
  };
}

function setPatientExtension(patient: Patient, coding: Coding | undefined): void {
  const url = coding?.system;

  if (!url) {
    return;
  }

  const extension = getExtension(patient, url);

  if (extension) {
    extension.valueCoding = coding;
  } else {
    if (!patient.extension) {
      patient.extension = [];
    }
    patient.extension?.push({
      url: url,
      valueCoding: coding,
    } as Extension);
  }
}
