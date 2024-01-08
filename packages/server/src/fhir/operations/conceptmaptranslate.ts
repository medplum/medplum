import {
  ConceptMapTranslateParameters,
  Operator,
  allOk,
  badRequest,
  conceptMapTranslate,
  isOperationOutcome,
  notFound,
} from '@medplum/core';
import { ConceptMap, OperationOutcome } from '@medplum/fhirtypes';
import { Request, Response } from 'express';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';
import { getOperationDefinition } from './definitions';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';

const operation = getOperationDefinition('ConceptMap', 'translate');

export async function conceptMapTranslateHandler(req: Request, res: Response): Promise<void> {
  const params = parseInputParameters<ConceptMapTranslateParameters>(operation, req);

  const map = await lookupConceptMap(params, req.params.id);
  if (isOperationOutcome(map)) {
    sendOutcome(res, map);
    return;
  }

  const output = conceptMapTranslate(map, params);
  await sendOutputParameters(operation, res, allOk, output);
}

async function lookupConceptMap(
  params: ConceptMapTranslateParameters,
  id?: string
): Promise<ConceptMap | OperationOutcome> {
  const ctx = getAuthenticatedContext();
  if (id) {
    return ctx.repo.readResource('ConceptMap', id);
  } else if (params.url) {
    const result = await ctx.repo.searchOne<ConceptMap>({
      resourceType: 'ConceptMap',
      filters: [{ code: 'url', operator: Operator.EQUALS, value: params.url }],
      sortRules: [{ code: 'version', descending: true }],
    });
    if (!result) {
      return notFound;
    }
    return result;
  } else if (params.source) {
    const result = await ctx.repo.searchOne<ConceptMap>({
      resourceType: 'ConceptMap',
      filters: [{ code: 'source', operator: Operator.EQUALS, value: params.source }],
      sortRules: [{ code: 'version', descending: true }],
    });
    if (!result) {
      return notFound;
    }
    return result;
  } else {
    return badRequest('No ConceptMap specified');
  }
}
