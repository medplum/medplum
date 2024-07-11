import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { HumanName, Patient, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
import {
  addLanguage,
  extensionURLMapping,
  observationCategoryMapping,
  observationCodeMapping,
  setExtension,
  upsertObservation,
} from './intake-utils';

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

  setExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race']);
  setExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity']);
  setExtension(patient, extensionURLMapping.veteran, 'valueBoolean', answers['veteran-status']);

  // Handle language preferences

  const languagesSpoken = answers['languages-spoken'];
  if (languagesSpoken?.valueCoding) {
    addLanguage(patient, languagesSpoken.valueCoding);
  }
  const preferredLanguage = answers['preferred-language'];
  if (preferredLanguage?.valueCoding) {
    addLanguage(patient, preferredLanguage.valueCoding, true);
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
