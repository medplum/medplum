// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MedplumClient, createReference } from '@medplum/core';
import { Coding, Encounter, Questionnaire, Task } from '@medplum/fhirtypes';

export interface DSIScreeningConfig {
  /** Minimum age for screening eligibility */
  minAgeYears: number;
  /** Years to look back for prior procedures */
  lookbackYears: number;
  /** The procedure coding to search for */
  procedureCoding: Coding;
  /** Feedback questionnaire configuration */
  feedbackQuestionnaire: {
    identifier: { system: string; value: string };
    title: string;
    name: string;
  };
  /** Clinical recommendation text */
  clinicalRecommendation: {
    title: string;
    guidelinesUrl: string;
    actionText: string;
  };
  /** Optional gender requirement (e.g., 'female' for mammography) */
  requiredGender?: 'male' | 'female' | 'other' | 'unknown';
}

export function getAgeInYears(birthDate: string): number {
  const b = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) {
    age--;
  }
  return age;
}

export function buildFeedbackQuestionnaire(config: DSIScreeningConfig): Questionnaire {
  return {
    resourceType: 'Questionnaire',
    status: 'active',
    name: config.feedbackQuestionnaire.name,
    title: config.feedbackQuestionnaire.title,
    description: 'How helpful was this screening recommendation?',
    identifier: [config.feedbackQuestionnaire.identifier],
    item: [
      {
        linkId: 'helpfulness',
        text: 'How helpful was this alert?',
        type: 'choice',
        required: true,
        answerOption: [
          { valueString: 'Not at all helpful' },
          { valueString: 'Slightly helpful' },
          { valueString: 'Somewhat helpful' },
          { valueString: 'Very helpful' },
          { valueString: 'Extremely helpful' },
        ],
      },
      {
        linkId: 'comments',
        text: 'Additional feedback (optional)',
        type: 'string',
        required: false,
      },
    ],
  };
}

export function generateClinicalNote(config: DSIScreeningConfig, patientAge: number): string {
  return (
    `${config.clinicalRecommendation.title}\n\n` +
    `This patient meets USPSTF criteria for ${config.procedureCoding.display?.toLowerCase()} screening: ` +
    `Age ${patientAge} years (recommended: ≥${config.minAgeYears} years)${
      config.requiredGender ? `, ${config.requiredGender} gender` : ''
    } ` +
    `and no ${config.procedureCoding.display?.toLowerCase()} documented in the past ${
      config.lookbackYears
    } years.\n\n` +
    `${config.clinicalRecommendation.actionText}\n\n` +
    `USPSTF Guidelines: ${config.clinicalRecommendation.guidelinesUrl}`
  );
}

export async function processDSIScreening(
  medplum: MedplumClient,
  encounter: Encounter,
  config: DSIScreeningConfig
): Promise<Task | undefined> {
  // Validate encounter has a patient subject
  if (!encounter?.subject?.reference?.startsWith('Patient/')) {
    console.log(`Skipping because encounter subject is not a patient: ${encounter.subject?.reference}`);
    return undefined;
  }

  const patientId = encounter.subject.reference.split('/')[1];
  const patient = await medplum.readResource('Patient', patientId);

  if (!patient.birthDate) {
    console.log('Skipping because patient has no birth date');
    return undefined;
  }

  // Find practitioner in encounter
  const practitionerReference = encounter.participant?.find((participant) =>
    participant.individual?.reference?.startsWith('Practitioner/')
  )?.individual;

  if (!practitionerReference) {
    console.log('Skipping because encounter participant is not a practitioner:', encounter.participant);
    return undefined;
  }

  // Check age eligibility
  const ageYears = getAgeInYears(patient.birthDate);
  if (ageYears < config.minAgeYears) {
    console.log(`Skipping because patient age (${ageYears}) is less than ${config.minAgeYears}`);
    return undefined;
  }

  // Check gender requirement if specified
  if (config.requiredGender && patient.gender !== config.requiredGender) {
    console.log(
      `Skipping because patient gender (${patient.gender}) does not match required gender (${config.requiredGender})`
    );
    return undefined;
  }

  // Check for prior procedures within lookback period
  const lookbackStart = new Date();
  lookbackStart.setFullYear(lookbackStart.getFullYear() - config.lookbackYears);

  const priorProcedures = await medplum.searchResources('Procedure', [
    ['subject', `Patient/${patientId}`],
    ['code', `${config.procedureCoding.system}|${config.procedureCoding.code}`],
    ['date', `ge${lookbackStart.toISOString()}`],
  ]);

  if (priorProcedures.length > 0) {
    console.log(
      `Skipping because patient has a prior ${config.procedureCoding.display?.toLowerCase()} procedure in the last ${
        config.lookbackYears
      } years`
    );
    return undefined;
  }

  // Check for existing tasks to avoid duplicates
  const existing = await medplum.searchResources('Task', [
    ['subject', `Patient/${patientId}`],
    ['status', 'requested'],
    ['code', `${config.procedureCoding.system}|${config.procedureCoding.code}`],
    ['encounter', `Encounter/${encounter.id}`],
  ]);

  if (existing.length > 0) {
    console.log('Skipping because a task already exists');
    return undefined;
  }

  // Create feedback questionnaire
  const feedbackQuestionnaire = await medplum.upsertResource(buildFeedbackQuestionnaire(config), {
    identifier: `${config.feedbackQuestionnaire.identifier.system}|${config.feedbackQuestionnaire.identifier.value}`,
  });

  // Create task
  const task: Task = await medplum.createResource({
    resourceType: 'Task',
    status: 'requested',
    intent: 'proposal',
    priority: 'routine',
    code: { coding: [config.procedureCoding], text: config.procedureCoding.display },
    for: createReference(patient),
    requester: practitionerReference,
    owner: practitionerReference,
    encounter: createReference(encounter),
    focus: createReference(feedbackQuestionnaire),
    input: [
      {
        type: { text: 'Questionnaire' },
        valueReference: createReference(feedbackQuestionnaire),
      },
    ],
    note: [
      {
        time: new Date().toISOString(),
        text: generateClinicalNote(config, ageYears),
      },
    ],
  });
  return task;
}
