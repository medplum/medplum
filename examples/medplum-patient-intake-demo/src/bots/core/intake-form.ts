import { BotEvent, createReference, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import { Patient, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  addAllergy,
  addCondition,
  addConsent,
  addCoverage,
  addFamilyMemberHistory,
  addLanguage,
  addMedication,
  consentCategoryMapping,
  consentPolicyRuleMapping,
  consentScopeMapping,
  convertDateToDateTime,
  extensionURLMapping,
  getGroupRepeatedAnswers,
  getHumanName,
  getPatientAddress,
  observationCategoryMapping,
  observationCodeMapping,
  setExtension,
  upsertObservation,
} from './intake-utils';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<void> {
  const response = event.input;

  if (!response.questionnaire) {
    throw new Error('Missing questionnaire');
  }

  const questionnaire: Questionnaire = await medplum.readReference({ reference: response.questionnaire });
  const answers = getQuestionnaireAnswers(response);

  let patient: Patient = {
    resourceType: 'Patient',
  };

  // Handle demographic information

  const patientName = getHumanName(answers);
  if (patientName) {
    patient.name = [patientName];
  }

  if (answers['dob']?.valueDate) {
    patient.birthDate = answers['dob'].valueDate;
  }

  const patientAddress = getPatientAddress(answers);
  if (patientAddress) {
    patient.address = [patientAddress];
  }

  if (answers['gender-identity']?.valueCoding?.code) {
    patient.gender = answers['gender-identity'].valueCoding.code as Patient['gender'];
  }

  if (answers['phone']?.valueString) {
    patient.telecom = [{ system: 'phone', value: answers['phone'].valueString }];
  }

  if (answers['ssn']?.valueString) {
    patient.identifier = [
      {
        type: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0203',
              code: 'SS',
            },
          ],
        },
        system: 'http://hl7.org/fhir/sid/us-ssn',
        value: answers['ssn'].valueString,
      },
    ];
  }

  const emergencyContacts = getGroupRepeatedAnswers(questionnaire, response, 'emergency-contact');
  if (emergencyContacts) {
    patient.contact = [];
    for (const contact of emergencyContacts) {
      patient.contact.push({
        relationship: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
                code: 'EP',
                display: 'Emergency contact person',
              },
            ],
          },
        ],
        name: getHumanName(contact, 'emergency-contact-'),
        telecom: [{ system: 'phone', value: contact['emergency-contact-phone']?.valueString }],
      });
    }
  }

  setExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race']);
  setExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity']);
  setExtension(patient, extensionURLMapping.veteran, 'valueBoolean', answers['veteran-status']);

  addLanguage(patient, answers['languages-spoken']?.valueCoding);
  addLanguage(patient, answers['preferred-language']?.valueCoding, true);

  // Create the patient resource

  patient = await medplum.createResource(patient);

  // NOTE: Updating the questionnaire response does not trigger a loop because the bot subscription
  // is configured for "create"-only event.
  response.subject = createReference(patient);
  await medplum.updateResource(response);

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
    observationCodeMapping.smokingStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['smoking-status']?.valueCoding
  );

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.pregnancyStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['pregnancy-status']?.valueCoding
  );

  const estimatedDeliveryDate = convertDateToDateTime(answers['estimated-delivery-date']?.valueDate);
  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.estimatedDeliveryDate,
    observationCategoryMapping.socialHistory,
    'valueDateTime',
    estimatedDeliveryDate ? { valueDateTime: estimatedDeliveryDate } : undefined
  );

  // Handle allergies

  const allergies = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
  for (const allergy of allergies) {
    await addAllergy(medplum, patient, allergy);
  }

  // Handle medications
  const medications = getGroupRepeatedAnswers(questionnaire, response, 'medications');
  for (const medication of medications) {
    await addMedication(medplum, patient, medication);
  }

  // Handle medical history

  const medicalHistory = getGroupRepeatedAnswers(questionnaire, response, 'medical-history');
  for (const history of medicalHistory) {
    await addCondition(medplum, patient, history);
  }

  const familyMemberHistory = getGroupRepeatedAnswers(questionnaire, response, 'family-member-history');
  for (const history of familyMemberHistory) {
    await addFamilyMemberHistory(medplum, patient, history);
  }

  // Handle coverage

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
}
