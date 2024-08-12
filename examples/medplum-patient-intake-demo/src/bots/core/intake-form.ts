import { BotEvent, getQuestionnaireAnswers, MedplumClient } from '@medplum/core';
import {
  Address,
  HumanName,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItemAnswer,
  Reference,
} from '@medplum/fhirtypes';
import {
  addAllergy,
  addConsent,
  addCoverage,
  addLanguage,
  addMedication,
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

  const patientName = getHumanName(answers);
  patient.name = patientName ? [patientName] : patient.name;
  patient.birthDate = answers['dob']?.valueDate || patient.birthDate;
  const patientAddress = getPatientAddress(answers);
  patient.address = patientAddress ? [patientAddress] : patient.address;
  patient.gender = (answers['gender-identity']?.valueCoding?.code as Patient['gender']) || patient.gender;
  patient.telecom = answers['phone']?.valueString
    ? [{ system: 'phone', value: answers['phone'].valueString }]
    : patient.telecom;
  patient.identifier = answers['ssn']?.valueString
    ? [
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
      ]
    : patient.identifier;

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

  if (!response.questionnaire) {
    throw new Error('Missing questionnaire');
  }

  const questionnaire: Questionnaire = await medplum.readReference({ reference: response.questionnaire });

  // Handle emergency contact

  const emergencyContacts = getGroupRepeatedAnswers(questionnaire, response, 'emergency-contact');
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

  await medplum.updateResource(patient);
}

function getHumanName(
  answers: Record<string, QuestionnaireResponseItemAnswer>,
  prefix: string = ''
): HumanName | undefined {
  const patientName: HumanName = {};

  const givenName = [];
  if (answers[`${prefix}first-name`]?.valueString) {
    givenName.push(answers[`${prefix}first-name`].valueString as string);
  }
  if (answers[`${prefix}middle-name`]?.valueString) {
    givenName.push(answers[`${prefix}middle-name`].valueString as string);
  }

  if (givenName.length > 0) {
    patientName.given = givenName;
  }

  if (answers[`${prefix}last-name`]?.valueString) {
    patientName.family = answers[`${prefix}last-name`].valueString;
  }

  return Object.keys(patientName).length > 0 ? patientName : undefined;
}

function getPatientAddress(answers: Record<string, QuestionnaireResponseItemAnswer>): Address | undefined {
  const patientAddress: Address = {};

  if (answers['street']?.valueString) {
    patientAddress.line = [answers['street'].valueString];
  }

  if (answers['city']?.valueString) {
    patientAddress.city = answers['city'].valueString;
  }

  if (answers['state']?.valueCoding?.code) {
    patientAddress.state = answers['state'].valueCoding.code;
  }

  if (answers['zip']?.valueString) {
    patientAddress.postalCode = answers['zip'].valueString;
  }

  // To simplify the demo, we're assuming the address is always a home address
  return Object.keys(patientAddress).length > 0 ? { use: 'home', type: 'physical', ...patientAddress } : undefined;
}
