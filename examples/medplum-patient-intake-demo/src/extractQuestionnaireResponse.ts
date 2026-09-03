// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Bundle, QuestionnaireResponse } from '@medplum/fhirtypes';

type QuestionnaireExtractionClient = Pick<MedplumClient, 'executeBatch' | 'fhirUrl' | 'get'>;

/**
 * Runs SDC template extraction for a saved response and persists the returned transaction Bundle.
 * @param medplum - A Medplum client with FHIR operation and batch support.
 * @param response - The saved QuestionnaireResponse to extract.
 */
export async function extractQuestionnaireResponse(
  medplum: QuestionnaireExtractionClient,
  response: QuestionnaireResponse
): Promise<void> {
  if (!response.id) {
    throw new Error('QuestionnaireResponse was created without an id');
  }

  const extractBundle = await medplum.get<Bundle>(medplum.fhirUrl('QuestionnaireResponse', response.id, '$extract'));
  if (extractBundle.entry?.length) {
    await medplum.executeBatch(extractBundle);
  }
}
