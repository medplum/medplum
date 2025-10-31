// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { MedplumClient } from '@medplum/core';
import type { Bundle, Parameters, Questionnaire, QuestionnaireResponse } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';

const questionnaire: WithId<Questionnaire> = {
  resourceType: 'Questionnaire',
  id: randomUUID(),
  status: 'active',
};

const response: WithId<QuestionnaireResponse> = {
  resourceType: 'QuestionnaireResponse',
  id: randomUUID(),
  status: 'completed',
  questionnaire: `urn:uuid:${questionnaire.id}`,
};

const medplum = new MedplumClient();

// start-block get
const url = medplum.fhirUrl('QuestionnaireResponse', response.id, '$extract');
const bundle: Bundle = await medplum.get(url);
// end-block get

// start-block post
const input: Parameters = {
  resourceType: 'Parameters',
  parameter: [
    { name: 'questionnaire-response', resource: response },
    // Questionnaire only required if not specified by reference in the response
    { name: 'questionnaire', resource: questionnaire },
  ],
};
const output: Bundle = await medplum.post('/fhir/R4/QuestionnaireResponse/$extract', input);
// end-block post

console.log(questionnaire, response, bundle, input, output);
