// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient, SNOMED } from '@medplum/core';
import { Encounter } from '@medplum/fhirtypes';
import { DSIScreeningConfig, processDSIScreening } from '../utils/dsi';

const MAMMOGRAPHY_DSI_CONFIG: DSIScreeningConfig = {
  minAgeYears: 40,
  lookbackYears: 2,
  requiredGender: 'female',
  procedureCoding: {
    system: SNOMED,
    code: '71651007',
    display: 'Mammography',
  },
  feedbackQuestionnaire: {
    identifier: {
      system: 'https://www.medplum.com/questionnaires',
      value: 'dsi-feedback-mammography',
    },
    name: 'dsi-feedback-mammography',
    title: 'Mammography Alert Feedback',
  },
  clinicalRecommendation: {
    title: 'Breast Cancer Screening Recommendation',
    guidelinesUrl: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/breast-cancer-screening',
    actionText:
      'Clinical Action: Consider discussing mammography screening with the patient based on individual risk factors, family history, and patient preferences.',
  },
};

export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;
  await processDSIScreening(medplum, encounter, MAMMOGRAPHY_DSI_CONFIG);
}
