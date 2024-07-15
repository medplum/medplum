import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { HumanName, Patient, QuestionnaireResponse, Reference } from '@medplum/fhirtypes';
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

export async function handler(event: BotEvent<QuestionnaireResponse>, medplum: MedplumClient): Promise<void> {
  const response = event.input;

  const questionnaire = await medplum.readResource('Questionnaire', (response.questionnaire as string).split('/')[1]);
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
    observationCodeMapping.sexualOrientation,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['sexual-orientation'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.housingStatus,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['housing-status'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.educationLevel,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['education-level'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.pregnancyStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['pregnancy-status'].valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.estimatedDeliveryDate,
    observationCategoryMapping.socialHistory,
    'valueDateTime',
    { valueDateTime: convertDateToDateTime(answers['estimated-delivery-date'].valueDate) }
  );

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
    undefined,
    convertDateToDateTime(answers['consent-for-treatment-date'].valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['agreement-to-pay-for-treatment-help']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.pay,
    consentPolicyRuleMapping.hipaaSelfPay,
    convertDateToDateTime(answers['agreement-to-pay-for-treatment-date'].valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['notice-of-privacy-practices-signature']?.valueBoolean,
    consentScopeMapping.patientPrivacy,
    consentCategoryMapping.nopp,
    consentPolicyRuleMapping.hipaaNpp,
    convertDateToDateTime(answers['notice-of-privacy-practices-date'].valueDate)
  );

  await addConsent(
    medplum,
    patient,
    !!answers['acknowledgement-for-advance-directives-signature']?.valueBoolean,
    consentScopeMapping.adr,
    consentCategoryMapping.acd,
    undefined,
    convertDateToDateTime(answers['acknowledgement-for-advance-directives-date'].valueDate)
  );

  await medplum.updateResource(patient);
}
