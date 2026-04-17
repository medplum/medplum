// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import type { QuestionnaireResponse } from '@medplum/fhirtypes';
import { MedplumBaseAgent } from './medplum-agent';

const INTAKE_INSTRUCTIONS = `You are a patient intake assistant. Before the provider joins,
you greet the patient and collect:
1. Reason for visit
2. Current medications
3. Allergies
4. Any changes since last visit

Be warm, concise, and professional. When done, summarize what you collected.`;

/**
 * Intake Agent — a voice-interactive agent that speaks with the patient
 * before the provider joins. Collects intake information and writes it
 * as a FHIR QuestionnaireResponse linked to the Encounter.
 *
 * Uses the full STT → LLM → TTS pipeline via LiveKit Agents.
 */
export class IntakeAgent extends MedplumBaseAgent {
  /**
   * Creates a new IntakeAgent.
   * @param medplum - Authenticated MedplumClient instance.
   */
  constructor(medplum: MedplumClient) {
    super(medplum);
    this.instructions = INTAKE_INSTRUCTIONS;
  }

  /**
   * Saves collected intake responses as a FHIR QuestionnaireResponse.
   * @param responses - A record of question-answer pairs collected during intake.
   * @returns A promise that resolves when the QuestionnaireResponse has been created.
   */
  async saveIntakeData(responses: Record<string, string>): Promise<void> {
    if (!this.encounterId || !this.patientReference) {return;}

    await this.medplum.createResource<QuestionnaireResponse>({
      resourceType: 'QuestionnaireResponse',
      status: 'completed',
      subject: { reference: this.patientReference },
      encounter: { reference: `Encounter/${this.encounterId}` },
      item: Object.entries(responses).map(([question, answer], i) => ({
        linkId: `intake-${i}`,
        text: question,
        answer: [{ valueString: answer }],
      })),
    });
  }
}
