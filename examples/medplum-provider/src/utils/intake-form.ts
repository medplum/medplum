// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import {
  addProfileToResource,
  append,
  badRequest,
  createReference,
  EMPTY,
  getQuestionnaireAnswers,
  isNotFound,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  Organization,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
  QuestionnaireResponseItem,
  QuestionnaireResponseItemAnswer,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import {
  addAllergy,
  addCondition,
  addConsent,
  addCoverage,
  addExtension,
  addFamilyMemberHistory,
  addImmunization,
  addLanguage,
  addMedication,
  addPharmacy,
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
  PROFILE_URLS,
  upsertObservation,
} from './intake-utils';

export async function onboardPatient(
  medplum: MedplumClient,
  questionnaire: Questionnaire,
  response: QuestionnaireResponse
): Promise<Patient> {
  const answers = getQuestionnaireAnswers(response);

  let patient: Patient = {
    resourceType: 'Patient',
  };

  patient = addProfileToResource(patient, PROFILE_URLS.Patient);

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
  for (const contact of emergencyContacts ?? EMPTY) {
    patient.contact = append(patient.contact, {
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

  addExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race'], 'ombCategory');
  addExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity'], 'ombCategory');
  addExtension(patient, extensionURLMapping.veteran, 'valueBoolean', answers['veteran-status']);

  addLanguage(patient, answers['languages-spoken']?.valueCoding);
  addLanguage(patient, answers['preferred-language']?.valueCoding, true);

  // Prepare and validate all derived data before creating the Patient resource so a failed
  // submission never leaves behind a partially onboarded patient.
  const estimatedDeliveryDate = convertDateToDateTime(answers['estimated-delivery-date']?.valueDate);
  const allergies = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
  const medications = getGroupRepeatedAnswers(questionnaire, response, 'medications');
  const medicalHistory = getGroupRepeatedAnswers(questionnaire, response, 'medical-history');
  const familyMemberHistory = getGroupRepeatedAnswers(questionnaire, response, 'family-member-history');
  const vaccinationHistory = getGroupRepeatedAnswers(questionnaire, response, 'vaccination-history');
  const insuranceProviders = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');
  const treatmentConsentDate = convertDateToDateTime(answers['consent-for-treatment-date']?.valueDate);
  const agreementToPayDate = convertDateToDateTime(answers['agreement-to-pay-for-treatment-date']?.valueDate);
  const privacyPracticesDate = convertDateToDateTime(answers['notice-of-privacy-practices-date']?.valueDate);
  const advanceDirectivesDate = convertDateToDateTime(
    answers['acknowledgement-for-advance-directives-date']?.valueDate
  );

  assertNoEmptyAnswers(response.item);
  validateCoverageGroups(insuranceProviders);

  await validateResourceBeforeCreate(medplum, patient);
  await validateResourceBeforeCreate(medplum, response);

  // Create the patient resource

  patient = await medplum.createResource(patient);

  // NOTE: Updating the questionnaire response does not trigger a loop because the bot subscription
  // is configured for "create"-only event.
  await medplum.createResource({
    ...response,
    subject: createReference(patient),
  });

  // Handle observations

  await upsertObservation(
    medplum,
    patient,
    observationCodeMapping.sexualOrientation,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['sexual-orientation']?.valueCoding,
    PROFILE_URLS.ObservationSexualOrientation
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
    answers['smoking-status']?.valueCoding,
    PROFILE_URLS.ObservationSmokingStatus
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
    estimatedDeliveryDate ? { valueDateTime: estimatedDeliveryDate } : undefined
  );

  // Handle allergies

  for (const allergy of allergies) {
    await addAllergy(medplum, patient, allergy);
  }

  // Handle medications

  for (const medication of medications) {
    await addMedication(medplum, patient, medication);
  }

  // Handle medical history

  for (const history of medicalHistory) {
    await addCondition(medplum, patient, history);
  }

  for (const history of familyMemberHistory) {
    await addFamilyMemberHistory(medplum, patient, history);
  }

  // Handle vaccination history (immunizations)

  for (const vaccine of vaccinationHistory) {
    await addImmunization(medplum, patient, vaccine);
  }

  // Handle coverage

  for (const provider of insuranceProviders) {
    await addCoverage(medplum, patient, provider);
  }

  // Handle preferred pharmacy

  const preferredPharmacyReference = answers['preferred-pharmacy-reference']?.valueReference;
  if (preferredPharmacyReference) {
    await addPharmacy(medplum, patient, preferredPharmacyReference as Reference<Organization>);
  }

  // Handle consents

  await addConsent(
    medplum,
    patient,
    !!answers['consent-for-treatment-signature']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.med,
    consentPolicyRuleMapping.cric,
    treatmentConsentDate
  );

  await addConsent(
    medplum,
    patient,
    !!answers['agreement-to-pay-for-treatment-help']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.pay,
    consentPolicyRuleMapping.hipaaSelfPay,
    agreementToPayDate
  );

  await addConsent(
    medplum,
    patient,
    !!answers['notice-of-privacy-practices-signature']?.valueBoolean,
    consentScopeMapping.patientPrivacy,
    consentCategoryMapping.nopp,
    consentPolicyRuleMapping.hipaaNpp,
    privacyPracticesDate
  );

  await addConsent(
    medplum,
    patient,
    !!answers['acknowledgement-for-advance-directives-signature']?.valueBoolean,
    consentScopeMapping.adr,
    consentCategoryMapping.acd,
    consentPolicyRuleMapping.adr,
    advanceDirectivesDate
  );

  return patient;
}

function isPopulatedValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(isPopulatedValue);
  }
  if (typeof value === 'object') {
    return Object.values(value).some(isPopulatedValue);
  }
  return true;
}

function assertNoEmptyAnswers(
  items: QuestionnaireResponseItem[] | undefined,
  pathPrefix = 'QuestionnaireResponse'
): void {
  if (!items) {
    return;
  }
  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const itemPath = `${pathPrefix}.item[${itemIndex}]`;
    for (let ansIndex = 0; ansIndex < (item.answer ?? EMPTY).length; ansIndex++) {
      const answer = item.answer?.[ansIndex];
      if (!answer) {
        continue;
      }
      if (answer.item?.length) {
        assertNoEmptyAnswers(answer.item, `${itemPath}.answer[${ansIndex}]`);
        continue;
      }
      const hasValue = Object.entries(answer).some(([key, val]) => key.startsWith('value') && isPopulatedValue(val));
      if (!hasValue) {
        throw new OperationOutcomeError(
          badRequest(`Invalid empty non-primitive value (${itemPath}.answer[${ansIndex}])`)
        );
      }
    }
    assertNoEmptyAnswers(item.item, itemPath);
  }
}

function validateCoverageGroups(coverageGroups: Record<string, QuestionnaireResponseItemAnswer>[]): void {
  for (const provider of coverageGroups) {
    const payor = provider['insurance-provider']?.valueReference;
    const subscriberId = provider['subscriber-id']?.valueString;
    const relationship = provider['relationship-to-subscriber']?.valueCoding;
    if (!payor || !subscriberId || !relationship || !isPopulatedValue(relationship)) {
      throw new OperationOutcomeError(
        badRequest('Coverage requires an insurance provider, subscriber ID, and relationship to subscriber')
      );
    }
  }
}

async function validateResourceBeforeCreate(medplum: MedplumClient, resource: Resource): Promise<void> {
  try {
    const outcome = await medplum.validateResource(resource);
    if (outcome.issue?.some((issue) => issue.severity === 'error' || issue.severity === 'fatal')) {
      throw new OperationOutcomeError(outcome);
    }
  } catch (err) {
    // MockClient does not register POST /:resourceType/$validate and responds with 404.
    if (err instanceof OperationOutcomeError && isNotFound(err.outcome)) {
      return;
    }
    throw err;
  }
}
