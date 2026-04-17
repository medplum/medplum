// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { MedplumClient } from '@medplum/core';
import { MedplumBaseAgent } from './medplum-agent';

const CODING_INSTRUCTIONS = `You are a medical coding assistant. After a visit,
you review the clinical note and suggest:
1. ICD-10 diagnosis codes
2. CPT procedure codes
3. E/M level recommendation

Present your suggestions for provider review. Never finalize codes without provider approval.`;

/**
 * Coding Agent — runs post-visit. Reads the DocumentReference (clinical note),
 * processes it through the LLM, and writes suggested codes as a
 * DocumentReference with category 'ai-coding-suggestion'.
 */
export class CodingAgent extends MedplumBaseAgent {
  /**
   * Creates a new CodingAgent.
   * @param medplum - Authenticated MedplumClient instance.
   */
  constructor(medplum: MedplumClient) {
    super(medplum);
    this.instructions = CODING_INSTRUCTIONS;
  }
}
