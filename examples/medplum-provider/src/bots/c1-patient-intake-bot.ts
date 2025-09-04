// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, BotEvent, getQuestionnaireAnswers, addProfileToResource, createReference } from '@medplum/core';
import { Patient, QuestionnaireResponse } from '@medplum/fhirtypes';
import {
  addCoverage,
  addEncounter,
  addExtension,
  addProcedure,
  extensionURLMapping,
  getGroupRepeatedAnswers,
  getHumanName,
  getPatientAddress,
  PROFILE_URLS,
} from '../utils/intake-utils';

export async function handler(medplum: MedplumClient, event: BotEvent<QuestionnaireResponse>): Promise<Patient> {
  const { input: response } = event;

  if (!response.questionnaire) {
    throw new Error('Questionnaire is required');
  }

  const questionnaire = await medplum.readResource('Questionnaire', response.questionnaire.split('/')?.[1]);
  if (!questionnaire) {
    throw new Error('Questionnaire not found');
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

  if (answers['dob']?.valueDateTime) {
    patient.birthDate = answers['dob'].valueDateTime.split('T')[0];
    (patient as any)._birthDate = {
      extension: [
        {
          url: extensionURLMapping.patientBirthTime,
          valueDateTime: answers['dob'].valueDateTime,
        },
      ],
    };
  }

  const patientAddress = getPatientAddress(answers);
  if (patientAddress) {
    patient.address = [patientAddress];
  }

  if (answers['identifier']?.valueString) {
    patient.identifier = [
      {
        system: 'http://example.com/patientId',
        value: answers['identifier'].valueString,
      },
    ];
  }

  if (answers['gender-identity']?.valueCoding?.code) {
    patient.gender = answers['gender-identity'].valueCoding.code as Patient['gender'];
  }

  patient.telecom = [];
  if (answers['phone']?.valueString) {
    patient.telecom.push({ system: 'phone', value: answers['phone'].valueString, use: 'home' });
  }
  if (answers['email']?.valueString) {
    patient.telecom.push({ system: 'email', value: answers['email'].valueString, use: 'home' });
  }

  addExtension(patient, extensionURLMapping.race, 'valueCoding', answers['race'], 'ombCategory');
  addExtension(patient, extensionURLMapping.ethnicity, 'valueCoding', answers['ethnicity'], 'ombCategory');

  // Create the Patient resource
  patient = await medplum.createResource(patient);

  // Create the QuestionnaireResponse resource
  // NOTE: Updating the questionnaire response does not trigger a loop because the bot subscription
  // is configured for "create"-only event.
  response.subject = createReference(patient);
  await medplum.createResource(response);

  // Handle encounter
  const encounters = getGroupRepeatedAnswers(questionnaire, response, 'encounters');
  for (const encounter of encounters) {
    await addEncounter(medplum, patient, encounter);
  }

  // Handle intervention and procedure
  const interventions = getGroupRepeatedAnswers(questionnaire, response, 'interventions');
  for (const intervention of interventions) {
    await addProcedure(medplum, patient, intervention, true);
  }

  const procedures = getGroupRepeatedAnswers(questionnaire, response, 'procedures');
  for (const procedure of procedures) {
    await addProcedure(medplum, patient, procedure);
  }

  // Handle payers
  const payers = getGroupRepeatedAnswers(questionnaire, response, 'payers');
  for (const payer of payers) {
    await addCoverage(medplum, patient, payer);
  }

  return patient;
}
