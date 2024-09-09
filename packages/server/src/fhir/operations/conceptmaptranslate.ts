import {
  ConceptMapTranslateParameters,
  OperationOutcomeError,
  Operator,
  allOk,
  badRequest,
  conceptMapTranslate,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { ConceptMap } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

const operation = getOperationDefinition('ConceptMap', 'translate');

export async function conceptMapTranslateHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ConceptMapTranslateParameters>(operation, req);

  const map = await lookupConceptMap(params, req.params.id);

  const output = conceptMapTranslate(map, params);
  return [allOk, buildOutputParameters(operation, output)];
}

async function lookupConceptMap(params: ConceptMapTranslateParameters, id?: string): Promise<ConceptMap> {
  const ctx = getAuthenticatedContext();
  if (id) {
    return ctx.repo.readResource('ConceptMap', id);
  } else if (params.url) {
    return findTerminologyResource<ConceptMap>('ConceptMap', params.url);
  } else if (params.source) {
    const result = await ctx.repo.searchOne<ConceptMap>({
      resourceType: 'ConceptMap',
      filters: [{ code: 'source', operator: Operator.EQUALS, value: params.source }],
      sortRules: [{ code: 'version', descending: true }],
    });
    if (!result) {
      throw new OperationOutcomeError(badRequest(`ConceptMap for source ${params.source} not found`));
    }
    return result;
  }

  throw new OperationOutcomeError(badRequest('No ConceptMap specified'));
}
