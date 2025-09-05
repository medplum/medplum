// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { BotEvent, MedplumClient, SNOMED } from '@medplum/core';
import { Encounter } from '@medplum/fhirtypes';
import { DSIScreeningConfig, processDSIScreening } from '../utils/dsi';

const COLONOSCOPY_DSI_CONFIG: DSIScreeningConfig = {
  minAgeYears: 45,
  lookbackYears: 5,
  procedureCoding: {
    system: SNOMED,
    code: '73761001',
    display: 'Colonoscopy',
  },
  feedbackQuestionnaire: {
    identifier: {
      system: 'https://www.medplum.com/questionnaires',
      value: 'dsi-feedback-colonoscopy',
    },
    name: 'dsi-feedback-colonoscopy',
    title: 'Colonoscopy Alert Feedback',
  },
  clinicalRecommendation: {
    title: 'Colorectal Cancer Screening Recommendation',
    guidelinesUrl: 'https://www.uspreventiveservicestaskforce.org/uspstf/recommendation/colorectal-cancer-screening',
    actionText:
      'Clinical Action: Consider discussing screening options with the patient, including colonoscopy, FIT, or other appropriate methods based on patient preference and risk factors.',
  },
};

export async function handler(medplum: MedplumClient, event: BotEvent<Encounter>): Promise<void> {
  const encounter = event.input;
  await processDSIScreening(medplum, encounter, COLONOSCOPY_DSI_CONFIG);
}
