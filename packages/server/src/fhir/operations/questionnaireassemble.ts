// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, deepEquals, isResource, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Parameters, ParametersParameter, Questionnaire, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { assembleQuestionnaire } from './questionnaireassembly';
import type { QuestionnaireInput } from './questionnaireassemblyresolver';
import { QuestionnaireResolver } from './questionnaireassemblyresolver';

/**
 * Reads the three SDC input choices without relaxing parsing for other operations.
 * @param req - Operation request.
 * @returns The supplied Questionnaire, canonical URI, or local Reference.
 */
function parseQuestionnaireInput(req: FhirRequest): QuestionnaireInput | undefined {
  const body = req.body;
  if (req.query.questionnaire !== undefined) {
    throw new OperationOutcomeError(badRequest('Supply questionnaire in the POST body, not the query string'));
  }
  if (isResource<Questionnaire>(body, 'Questionnaire')) {
    return body;
  }
  if (isResource<Parameters>(body, 'Parameters')) {
    if (body.parameter?.some((p) => p.name !== 'questionnaire') || (body.parameter?.length ?? 0) > 1) {
      throw new OperationOutcomeError(badRequest('Expected one questionnaire input parameter'));
    }
    return body.parameter?.[0] ? getParameterValue(body.parameter[0]) : undefined;
  }
  if (body !== undefined && body !== null && Object.keys(body).length > 0) {
    throw new OperationOutcomeError(badRequest('Expected a Questionnaire or Parameters resource'));
  }
  return undefined;
}

function getParameterValue(parameter: ParametersParameter): QuestionnaireInput {
  const values = Object.keys(parameter).filter(
    (key) => key === 'resource' || key === 'part' || key.startsWith('value')
  );
  if (values.length === 1) {
    if (isResource<Questionnaire>(parameter.resource, 'Questionnaire')) {
      return parameter.resource;
    }
    if (typeof parameter.valueUri === 'string' && parameter.valueUri.length > 0) {
      return parameter.valueUri;
    }
    if (parameter.valueReference?.reference && !parameter.valueReference.resource) {
      return parameter.valueReference as Reference<Questionnaire>;
    }
  }
  throw new OperationOutcomeError(
    badRequest('questionnaire must contain exactly one Questionnaire, valueUri, or valueReference')
  );
}

export async function questionnaireAssembleHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const input = parseQuestionnaireInput(req);
  if (!input && !req.params.id) {
    return [badRequest('Questionnaire to assemble must be specified')];
  }
  const resolver = new QuestionnaireResolver(repo);
  const questionnaire = await resolver.resolve(input ?? { reference: `Questionnaire/${req.params.id ?? ''}` });
  if (req.params.id) {
    const instance = await resolver.resolve({ reference: `Questionnaire/${req.params.id}` });
    if (input && questionnaire.id !== instance.id) {
      return [badRequest('Questionnaire input conflicts with the instance URL')];
    }
    if (isResource<Questionnaire>(input, 'Questionnaire') && !deepEquals(input, instance)) {
      return [
        badRequest(
          'Inline Questionnaire conflicts with the stored instance; use the type-level operation for modified input'
        ),
      ];
    }
  }
  const result = await assembleQuestionnaire(repo, questionnaire, resolver);
  if (result.issues.length === 0) {
    return [allOk, result.questionnaire];
  }
  return [
    allOk,
    {
      resourceType: 'Parameters',
      parameter: [
        { name: 'return', resource: result.questionnaire },
        { name: 'outcome', resource: { resourceType: 'OperationOutcome', issue: result.issues } },
      ],
    } satisfies Parameters,
  ];
}
