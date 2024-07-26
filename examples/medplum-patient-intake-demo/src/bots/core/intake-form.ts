import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  HumanName,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import {
  addConsent,
  addCoverage,
  addLanguage,
  consentCategoryMapping,
  consentPolicyRuleMapping,
  consentScopeMapping,
  convertDateToDateTime,
  extensionURLMapping,
  getGroupRepeatedAnswers,
  observationCategoryMapping,
  observationCodeMapping,
  setExtension,
  upsertObservation,
} from './intake-utils';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  const response = event.input;

  const answers = getQuestionnaireAnswers(response);

  if (!response.subject) {
    throw new Error('Missing subject');
  }

  const patient = await medplum.readReference(response.subject as Reference<Patient>);

  if (!patient) {
    throw new Error('Patient not found');
  }

  // Handle demographic information

  const patientName = getPatientName(answers);
  patient.name = patientName ? [patientName] : patient.name;
  patient.birthDate = answers['dob']?.valueDate || patient.birthDate;
  patient.gender = (answers['gender-identity']?.valueCoding?.code as Patient['gender']) || patient.gender;

  setExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race']);
  setExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity']);
  setExtension(patient, extensionURLMapping.veteran, 'valueBoolean', answers['veteran-status']);

  // Handle language preferences

  addLanguage(patient, answers['languages-spoken']?.valueCoding);
  addLanguage(patient, answers['preferred-language']?.valueCoding, true);

  // Handle observations

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.sexualOrientation,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['sexual-orientation']?.valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.housingStatus,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['housing-status']?.valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.educationLevel,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['education-level']?.valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.pregnancyStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['pregnancy-status']?.valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.estimatedDeliveryDate,
    observationCategoryMapping.socialHistory,
    'valueDateTime',
    { valueDateTime: convertDateToDateTime(answers['estimated-delivery-date']?.valueDate) }
  );

  // Handle coverage

  if (!response.questionnaire) {
    throw new Error('Missing questionnaire');
  }

  const questionnaire: Questionnaire = await medplum.readReference({ reference: response.questionnaire });
  const insuranceProviders = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');

  for (const provider of insuranceProviders) {
    await addCoverage(medplum, patient, provider);
  }

  // Handle consents

  await addConsent(
    medplum,
    patient,
    !!answers['consent-for-treatment-signature']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.med,
    consentPolicyRuleMapping.cric,
    convertDateToDateTime(answers['consent-for-treatment-date']?.valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['agreement-to-pay-for-treatment-help']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.pay,
    consentPolicyRuleMapping.hipaaSelfPay,
    convertDateToDateTime(answers['agreement-to-pay-for-treatment-date']?.valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['notice-of-privacy-practices-signature']?.valueBoolean,
    consentScopeMapping.patientPrivacy,
    consentCategoryMapping.nopp,
    consentPolicyRuleMapping.hipaaNpp,
    convertDateToDateTime(answers['notice-of-privacy-practices-date']?.valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['acknowledgement-for-advance-directives-signature']?.valueBoolean,
    consentScopeMapping.adr,
    consentCategoryMapping.acd,
    consentPolicyRuleMapping.adr,
    convertDateToDateTime(answers['acknowledgement-for-advance-directives-date']?.valueDate)
  );

  await medplum.updateResource(patient);
}

function getPatientName(answers: Record<string, QuestionnaireResponseItemAnswer>): HumanName | null {
  const patientName: HumanName = {};

  const givenName = [];
  if (answers['first-name']?.valueString) {
    givenName.push(answers['first-name'].valueString);
  }
  if (answers['middle-name']?.valueString) {
    givenName.push(answers['middle-name'].valueString);
  }

  if (givenName.length > 0) {
    patientName.given = givenName;
  }

  if (answers['last-name']?.valueString) {
    patientName.family = answers['last-name'].valueString;
  }

  return Object.keys(patientName).length > 0 ? patientName : null;
}
