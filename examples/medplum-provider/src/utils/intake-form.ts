// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import {
  addProfileToResource,
  append,
  badRequest,
  convertToTransactionBundle,
  createReference,
  EMPTY,
  generateId,
  getQuestionnaireAnswers,
  isOk,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  Organization,
  Patient,
  Questionnaire,
  QuestionnaireResponse,
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

function createTransactionRecorder(): { recorder: MedplumClient; resources: Resource[] } {
  const resources: Resource[] = [];
  const record = async <T extends Resource>(resource: T): Promise<T> => {
    const result = { ...resource, id: generateId() };
    resources.push(result);
    return result;
  };
  const recorder = { createResource: record, upsertResource: record } as unknown as MedplumClient;
  return { recorder, resources };
}

export async function onboardPatient(
  medplum: MedplumClient,
  questionnaire: Questionnaire,
  response: QuestionnaireResponse
): Promise<Patient> {
  const { recorder, resources } = createTransactionRecorder();

  const insuranceProviders = getGroupRepeatedAnswers(questionnaire, response, 'coverage-information');
  for (const provider of insuranceProviders) {
    if (
      !provider['insurance-provider']?.valueReference ||
      !provider['subscriber-id']?.valueString ||
      !provider['relationship-to-subscriber']?.valueCoding
    ) {
      throw new OperationOutcomeError(badRequest('Coverage Information is missing required answers'));
    }
  }

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

  // Create the patient resource

  patient = await recorder.createResource(patient);

  response.subject = createReference(patient);
  await recorder.createResource(response);

  // Handle observations

  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.sexualOrientation,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['sexual-orientation']?.valueCoding,
    PROFILE_URLS.ObservationSexualOrientation
  );

  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.housingStatus,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['housing-status']?.valueCoding
  );

  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.educationLevel,
    observationCategoryMapping.sdoh,
    'valueCodeableConcept',
    answers['education-level']?.valueCoding
  );

  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.smokingStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['smoking-status']?.valueCoding,
    PROFILE_URLS.ObservationSmokingStatus
  );

  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.pregnancyStatus,
    observationCategoryMapping.socialHistory,
    'valueCodeableConcept',
    answers['pregnancy-status']?.valueCoding
  );

  const estimatedDeliveryDate = convertDateToDateTime(answers['estimated-delivery-date']?.valueDate);
  await upsertObservation(
    recorder,
    patient,
    observationCodeMapping.estimatedDeliveryDate,
    observationCategoryMapping.socialHistory,
    'valueDateTime',
    estimatedDeliveryDate ? { valueDateTime: estimatedDeliveryDate } : undefined
  );

  // Handle allergies

  const allergies = getGroupRepeatedAnswers(questionnaire, response, 'allergies');
  for (const allergy of allergies) {
    await addAllergy(recorder, patient, allergy);
  }

  // Handle medications

  const medications = getGroupRepeatedAnswers(questionnaire, response, 'medications');
  for (const medication of medications) {
    await addMedication(recorder, patient, medication);
  }

  // Handle medical history

  const medicalHistory = getGroupRepeatedAnswers(questionnaire, response, 'medical-history');
  for (const history of medicalHistory) {
    await addCondition(recorder, patient, history);
  }

  const familyMemberHistory = getGroupRepeatedAnswers(questionnaire, response, 'family-member-history');
  for (const history of familyMemberHistory) {
    await addFamilyMemberHistory(recorder, patient, history);
  }

  // Handle vaccination history (immunizations)

  const vaccinationHistory = getGroupRepeatedAnswers(questionnaire, response, 'vaccination-history');
  for (const vaccine of vaccinationHistory) {
    await addImmunization(recorder, patient, vaccine);
  }

  // Handle coverage

  for (const provider of insuranceProviders) {
    await addCoverage(recorder, patient, provider);
  }

  // Handle preferred pharmacy

  const preferredPharmacyReference = answers['preferred-pharmacy-reference']?.valueReference;
  if (preferredPharmacyReference) {
    await addPharmacy(recorder, patient, preferredPharmacyReference as Reference<Organization>);
  }

  // Handle consents

  await addConsent(
    recorder,
    patient,
    !!answers['consent-for-treatment-signature']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.med,
    consentPolicyRuleMapping.cric,
    convertDateToDateTime(answers['consent-for-treatment-date']?.valueDate)
  );

  await addConsent(
    recorder,
    patient,
    !!answers['agreement-to-pay-for-treatment-help']?.valueBoolean,
    consentScopeMapping.treatment,
    consentCategoryMapping.pay,
    consentPolicyRuleMapping.hipaaSelfPay,
    convertDateToDateTime(answers['agreement-to-pay-for-treatment-date']?.valueDate)
  );

  await addConsent(
    recorder,
    patient,
    !!answers['notice-of-privacy-practices-signature']?.valueBoolean,
    consentScopeMapping.patientPrivacy,
    consentCategoryMapping.nopp,
    consentPolicyRuleMapping.hipaaNpp,
    convertDateToDateTime(answers['notice-of-privacy-practices-date']?.valueDate)
  );

  await addConsent(
    recorder,
    patient,
    !!answers['acknowledgement-for-advance-directives-signature']?.valueBoolean,
    consentScopeMapping.adr,
    consentCategoryMapping.acd,
    consentPolicyRuleMapping.adr,
    convertDateToDateTime(answers['acknowledgement-for-advance-directives-date']?.valueDate)
  );

  const bundle = convertToTransactionBundle({
    resourceType: 'Bundle',
    type: 'collection',
    entry: resources.map((resource) => ({ resource })),
  });
  const result = await medplum.executeBatch(bundle);

  for (const entry of result.entry ?? EMPTY) {
    if (entry.response?.outcome && !isOk(entry.response.outcome)) {
      throw new OperationOutcomeError(entry.response.outcome);
    }
  }

  const createdPatient = result.entry?.find((entry) => entry.resource?.resourceType === 'Patient')?.resource;
  if (!createdPatient) {
    throw new OperationOutcomeError(badRequest('Patient was not created'));
  }
  return createdPatient as Patient;
}
