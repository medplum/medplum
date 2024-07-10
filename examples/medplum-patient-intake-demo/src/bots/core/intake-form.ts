import { BotEvent, getExtension, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Coding,
  Extension,
  HumanName,
  Patient,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import { observationCategoryMapping, observationCodeMapping, upsertObservation } from './intake-utils';

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<void> {
  const response = event.input;
  const answers = getQuestionnaireAnswers(response);

  if (!response.subject) {
    return;
  }

  const patient = await medplum.readReference(response.subject as Reference<Patient>);

  if (!patient) {
    return;
  }

  // Handle demographic information

  const newName = {
    given: [answers['first-name'].valueString, answers['middle-name'].valueString],
    family: answers['last-name'].valueString,
  } as HumanName;

  patient.name = [newName];
  patient.birthDate = answers['dob'].valueDate;
  patient.gender = answers['gender-identity'].valueCoding?.code as Patient['gender'];

  setCodingExtension(patient, answers['race']);
  setCodingExtension(patient, answers['ethnicity']);

  // Handle language preferences

  const languagesSpoken = answers['languages-spoken'];
  if (languagesSpoken?.valueCoding) {
    addPatientLanguage(patient, languagesSpoken.valueCoding);
  }
  const preferredLanguage = answers['preferred-language'];
  if (preferredLanguage?.valueCoding) {
    addPatientLanguage(patient, preferredLanguage.valueCoding, true);
  }

  // Handle observations

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.sexualOrientiation,
    observationCategoryMapping.socialHistory,
    answers['sexual-orientation'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.housingStatus,
    observationCategoryMapping.sdoh,
    answers['housing-status'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.educationLevel,
    observationCategoryMapping.sdoh,
    answers['education-level'].valueCoding
  );

  await medplum.updateResource(patient);
}

function addPatientLanguage(patient: Patient, valueCoding: Coding, preferred: boolean = false): void {
  const patientCommunications = patient.communication || [];

  let language = patientCommunications.find(
    (communication) => communication.language.coding?.[0].code === valueCoding?.code
  );

  if (!language) {
    language = {
      language: {
        coding: [valueCoding],
      },
    };
    patientCommunications.push(language);
  }

  if (preferred) {
    language.preferred = preferred;
  }

  patient.communication = patientCommunications;
}

function setCodingExtension(patient: Patient, answer: QuestionnaireResponseItemAnswer): void {
  const value = answer.valueCoding;
  const url = value?.system;

  if (!url) {
    return;
  }

  const extension = getExtension(patient, url);

  if (extension) {
    extension.valueCoding = value;
  } else {
    if (!patient.extension) {
      patient.extension = [];
    }
    patient.extension?.push({
      url: url,
      valueCoding: value,
    } as Extension);
  }
}
