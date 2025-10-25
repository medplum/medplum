// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  ConceptMapTranslateMatch,
  ConceptMapTranslateOutput,
  ConceptMapTranslateParameters,
  WithId,
} from '@medplum/core';
import { allOk, badRequest, indexConceptMapCodings, OperationOutcomeError, Operator } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ConceptMap, ConceptMapGroupUnmapped } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { Column, Condition, SelectQuery } from '../sql';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

// TODO: Define hybrid OperationDefinition combining R4+R5 semantics
const operation = getOperationDefinition('ConceptMap', 'translate');

/** Set of equivalence/relationship codes that indicate a negative match, taken from both R4 and R5 value sets. */
const nonMatchingCodes = ['unmatched', 'disjoint', 'not-related-to'];

/** Code for equivalent relationship; this is the same in both R4 and R5 value sets. */
const EQUIVALENT = 'equivalent';

export async function conceptMapTranslateHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ConceptMapTranslateParameters>(operation, req);
  const map = await lookupConceptMap(params, req.params.id);

  const output = await translateConcept(map, params);
  return [allOk, buildOutputParameters(operation, output)];
}

async function lookupConceptMap(params: ConceptMapTranslateParameters, id?: string): Promise<WithId<ConceptMap>> {
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

export async function translateConcept(
  conceptMap: WithId<ConceptMap>,
  params: ConceptMapTranslateParameters
): Promise<ConceptMapTranslateOutput> {
  const matches: ConceptMapTranslateMatch[] = [];
  const sourceCodes = indexConceptMapCodings(params);

  for (const [system, codes] of Object.entries(sourceCodes)) {
    const results = await findConceptMappings(conceptMap, params, system, codes);
    if (results.length) {
      matches.push(...results);
    } else {
      // Unmapped codes from this map can produce values via defaults or by falling back to another ConceptMap
      await handleUnmappedCodes(conceptMap, params, system, codes, matches);
    }
  }

  return {
    result: matches.some((m) => !nonMatchingCodes.includes(m.equivalence as string)),
    match: matches,
  };
}

async function findConceptMappings(
  conceptMap: WithId<ConceptMap>,
  params: ConceptMapTranslateParameters,
  system: string,
  codes: string[]
): Promise<ConceptMapTranslateMatch[]> {
  const query = new SelectQuery('ConceptMapping')
    .column('conceptMap')
    .column(new Column('source', 'system', false, 'sourceSystem'))
    .column('sourceCode')
    .column('sourceDisplay')
    .column(new Column('target', 'system', false, 'targetSystem'))
    .column('targetCode')
    .column('targetDisplay')
    .column('relationship')
    .column('comment')
    .column(new Column('attr', 'kind'))
    .column(new Column('attr', 'uri'))
    .column(new Column('attr', 'type'))
    .column(new Column('attr', 'value'))
    .join(
      'INNER JOIN',
      'CodingSystem',
      'source',
      new Condition(new Column('ConceptMapping', 'sourceSystem'), '=', new Column('source', 'id'))
    )
    .join(
      'INNER JOIN',
      'CodingSystem',
      'target',
      new Condition(new Column('ConceptMapping', 'targetSystem'), '=', new Column('target', 'id'))
    )
    .join(
      'LEFT JOIN',
      'ConceptMapping_Attribute',
      'attr',
      new Condition(new Column('ConceptMapping', 'id'), '=', new Column('attr', 'mapping'))
    )
    .where('conceptMap', '=', conceptMap.id)
    .where(new Column('source', 'system'), '=', system)
    .where('sourceCode', 'IN', codes);

  if (params.targetsystem) {
    query.where(new Column('target', 'system'), '=', params.targetsystem);
  }

  const db = getDatabasePool(DatabaseMode.READER);
  const results = await query.execute(db);

  return parseDatabaseRows(results);
}

async function handleUnmappedCodes(
  conceptMap: ConceptMap,
  params: ConceptMapTranslateParameters,
  system: string,
  codes: string[],
  matches: ConceptMapTranslateMatch[]
): Promise<void> {
  const relevantMapGroups = conceptMap.group?.filter((g) => g.source === system && g.unmapped) ?? [];
  for (const group of relevantMapGroups) {
    const unmapped = group.unmapped as ConceptMapGroupUnmapped;
    switch (unmapped.mode) {
      case 'provided':
        for (const code of codes) {
          matches.push({
            concept: { system: group.target, code },
            equivalence: 'equal', // The same code is the translation, so it must be equal (not just equivalent)
          });
        }
        break;
      case 'fixed':
        matches.push({
          concept: { system: group.target, code: unmapped.code, display: unmapped.display },
          equivalence: EQUIVALENT,
        });
        break;
      case 'other-map': {
        const otherMap = await lookupConceptMap({ url: unmapped.url });
        const results = await translateConcept(otherMap, params);
        if (results.match?.length) {
          for (const otherMatch of results.match) {
            matches.push({ ...otherMatch, source: unmapped.url });
          }
        }
      }
    }
  }
}

function parseDatabaseRows(rows: any[]): ConceptMapTranslateMatch[] {
  const matches: ConceptMapTranslateMatch[] = [];
  for (const { targetSystem, targetCode, targetDisplay, relationship } of rows) {
    matches.push({
      concept: { system: targetSystem, code: targetCode, display: targetDisplay ?? undefined },
      equivalence: relationship ?? EQUIVALENT,
      // TODO: Collect attributes (i.e. `property`, `dependsOn`, `product`)
    });
  }

  return matches;
}
