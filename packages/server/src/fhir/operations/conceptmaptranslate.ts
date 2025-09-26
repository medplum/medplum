// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ConceptMapTranslateOutput,
  ConceptMapTranslateParameters,
  OperationOutcomeError,
  Operator,
  WithId,
  allOk,
  append,
  badRequest,
  conceptMapTranslate,
} from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { ConceptMap } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { Column, Condition, SelectQuery } from '../sql';
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

export async function translateConcept(
  conceptMap: WithId<ConceptMap>,
  params: ConceptMapTranslateParameters
): Promise<ConceptMapTranslateOutput> {
  const sourceCodes: Record<string, string[]> = Object.create(null);
  if (params.system && params.code && !params.coding && !params.codeableConcept) {
    sourceCodes[params.system] = [params.code];
  } else if (params.coding && !params.code && !params.codeableConcept) {
    if (params.coding.system && params.coding.code) {
      sourceCodes[params.coding.system] = [params.coding.code];
    }
  } else if (params.codeableConcept && !params.code && !params.coding) {
    for (const { system, code } of params.codeableConcept.coding ?? []) {
      if (system && code) {
        sourceCodes[system] = append(sourceCodes[system], code);
      }
    }
  } else if (params.code || params.coding || params.codeableConcept) {
    throw new OperationOutcomeError(badRequest('Ambiguous input: multiple source codings provided'));
  }
  if (!Object.values(sourceCodes).length) {
    throw new OperationOutcomeError(badRequest('Source Coding (system + code) must be specified'));
  }

  for (const [system, codes] of Object.entries(sourceCodes)) {
    await findConceptMappings(conceptMap, system, codes);
  }
}

async function findConceptMappings(conceptMap: WithId<ConceptMap>, system: string, codes: string[]): void {
  const query = new SelectQuery('ConceptMapping')
    .column('conceptMap')
    .column('sourceSystem')
    .column('sourceCode')
    .column('sourceDisplay')
    .column('targetSystem')
    .column('targetCode')
    .column('targetDisplay')
    .column('relationship')
    .column('comment')
    .join(
      'LEFT JOIN',
      'ConceptMapping_Attribute',
      'attr',
      new Condition(new Column('ConceptMapping', 'id'), '=', new Column('attr', 'mapping'))
    )
    .column(new Column('attr', 'kind'))
    .column(new Column('attr', 'uri'))
    .column(new Column('attr', 'type'))
    .column(new Column('attr', 'value'))
    .where('conceptMap', '=', conceptMap.id)
    .where('sourceSystem', '=', system)
    .where('sourceCode', 'IN', codes);
}

async function lookupConceptMap(params: ConceptMapTranslateParameters, id?: string): Promise<ConceptMap> {
  const { repo } = getAuthenticatedContext();
  if (id) {
    return repo.readResource('ConceptMap', id);
  } else if (params.url) {
    return findTerminologyResource<ConceptMap>('ConceptMap', params.url);
  } else if (params.source) {
    const result = await repo.searchOne<ConceptMap>({
      resourceType: 'ConceptMap',
      filters: [{ code: 'source', operator: Operator.EQUALS, value: params.source }],
      sortRules: [{ code: 'version', descending: true }],
    });
    if (!result) {
      throw new OperationOutcomeError(badRequest(`ConceptMap for source ${params.source} not found`));
    }
    return result;
  } else {
    throw new OperationOutcomeError(badRequest('No ConceptMap specified'));
  }
}
