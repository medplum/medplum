// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  ConceptMapTranslateMatch,
  ConceptMapTranslateMatchAttribute,
  ConceptMapTranslateOutput,
  ConceptMapTranslateParameters,
  WithId,
} from '@medplum/core';
import {
  allOk,
  append,
  badRequest,
  EMPTY,
  indexConceptMapCodings,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { ConceptMap, ConceptMapGroupUnmapped, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { Column, Condition, SelectQuery } from '../sql';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource } from './utils/terminology';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  url: 'http://hl7.org/fhir/OperationDefinition/ConceptMap-translate',
  version: '5.0.1',
  name: 'Translate',
  title: 'Concept Translation',
  status: 'draft',
  kind: 'operation',
  experimental: false,
  description:
    "Translate a code from one value set to another, based on the specified ConceptMap resource. If no ConceptMap resource is specified, then other additional knowledge available to the server may be used. \r\n\r\n One (and only one) of the in parameters (sourceCode, sourceCoding, sourceCodeableConcept, targetCode, targetCoding, or targetCodeableConcept) SHALL be provided, to identify the code that is to be translated.  \r\n\r\n The operation returns a set of parameters including a 'result' for whether there is an acceptable match, and a list of possible matches. Note that the list of matches may include notes of codes for which mapping is specifically excluded (i.e. 'not-related-to'), so implementers have to check the target.relationship for each match. If a source* parameter is provided, the $translate operation will return all matches whereby the provided source concept is the source of a mapping relationship (in a specified ConceptMap or otherwise known to the server). If a target* parameter is provided, the $translate operation will return all matches whereby the provided target concept is the target of a mapping relationship (in a specified ConceptMap or otherwise known to the server). Note: The source value set is an optional parameter because in some cases, the client cannot know what the source value set is. However, without a source value set, the server may be unable to safely identify an applicable concept map, and would return an error. For this reason, a source value set SHOULD always be provided. Note that servers may be able to identify an appropriate concept map without a source value set if there is a full mapping for the entire code system in the concept map, or by manual intervention.",
  code: 'translate',
  resource: ['ConceptMap'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    {
      name: 'url',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        "A canonical URL for a concept map. The server must know the concept map (e.g. it is defined explicitly in the server's concept maps, or it is defined implicitly by some code system known to the server.",
      type: 'uri',
    },
    {
      name: 'source',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'Identifies the value set used when the concept (system/code pair) was chosen. May be a logical id, or an absolute or relative location. The source value set is an optional parameter because in some cases, the client cannot know what the source value set is. However, without a source value set, the server may be unable to safely identify an applicable concept map, and would return an error. For this reason, a source value set SHOULD always be provided. Note that servers may be able to identify an appropriate concept map without a source value set if there is a full mapping for the entire code system in the concept map, or by manual intervention',
      type: 'uri',
    },
    {
      name: 'conceptMap',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'The concept map is provided directly as part of the request. Servers may choose not to accept concept maps in this fashion.',
      type: 'ConceptMap',
    },
    {
      name: 'code',
      use: 'in',
      min: 0,
      max: '1',
      documentation: 'The code that is to be translated. If a code is provided, a system must be provided',
      type: 'code',
    },
    {
      name: 'system',
      use: 'in',
      min: 0,
      max: '1',
      documentation: 'The system for the code that is to be translated',
      type: 'uri',
    },
    {
      name: 'coding',
      use: 'in',
      min: 0,
      max: '1',
      documentation: 'A coding to translate',
      type: 'Coding',
    },
    {
      name: 'codeableConcept',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'A full codeableConcept to validate. The server can translate any of the coding values (e.g. existing translations) as it chooses',
      type: 'CodeableConcept',
    },
    {
      name: 'targetsystem',
      use: 'in',
      min: 0,
      max: '1',
      documentation:
        'Identifies a target code system in which a mapping is sought. This parameter is an alternative to the targetScope parameter - only one is required. Searching for any translation to a target code system irrespective of the context (e.g. target valueset) may lead to unsafe results, and it is at the discretion of the server to decide when to support this operation',
      type: 'uri',
    },
    {
      name: 'result',
      use: 'out',
      min: 1,
      max: '1',
      documentation:
        "True if the concept could be translated successfully. The value can only be true if at least one returned match has a relationship other than 'not-related-to'.",
      type: 'boolean',
    },
    {
      name: 'message',
      use: 'out',
      min: 0,
      max: '1',
      documentation:
        'Error details, for display to a human. If this is provided when result = true, the message carries hints and warnings (e.g. a note that the matches could be improved by providing additional detail)',
      type: 'string',
    },
    {
      name: 'match',
      use: 'out',
      min: 0,
      max: '*',
      documentation:
        "A concept in the target value set with a relationship. Note that there may be multiple matches of equal or differing relationships, and the matches may include the 'not-related-to' relationship value which means that there is no translation",
      part: [
        {
          name: 'equivalence',
          use: 'out',
          min: 0,
          max: '1',
          documentation:
            'A code indicating the equivalence of the translation, using values from [ConceptMapEquivalence](valueset-concept-map-equivalence.html)',
          type: 'code',
        },
        {
          name: 'concept',
          use: 'out',
          min: 0,
          max: '1',
          documentation:
            'The translation outcome. Note that this would never have userSelected = true, since the process of translations implies that the user is not selecting the code (and only the client could know differently)',
          type: 'Coding',
        },
        {
          name: 'property',
          use: 'out',
          min: 0,
          max: '*',
          documentation:
            'A property of this mapping (may be used to supply for example, mapping priority, provenance, presentation hints, flag as experimental, and additional documentation)',
          part: [
            {
              name: 'uri',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The uri that identifies the property',
              type: 'uri',
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'Coding',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'string',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'integer',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'boolean',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'dateTime',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'decimal',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'code',
                },
              ],
              name: 'value',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The value of the property',
              type: 'Element',
            },
          ],
        },
        {
          name: 'product',
          use: 'out',
          min: 0,
          max: '*',
          documentation: 'A data value to go in an attribute that is the product of this mapping',
          part: [
            {
              name: 'attribute',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The attribute for this product',
              type: 'uri',
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'code',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'Coding',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'string',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'boolean',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'Quantity',
                },
              ],
              name: 'value',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The value for this product',
              type: 'Element',
            },
          ],
        },
        {
          name: 'dependsOn',
          use: 'out',
          min: 0,
          max: '*',
          documentation: 'An data value in an additional attribute that this mapping depends on',
          part: [
            {
              name: 'attribute',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The attribute for this product',
              type: 'uri',
            },
            {
              extension: [
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'code',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'Coding',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'string',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'integer',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'boolean',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'dateTime',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'decimal',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'uri',
                },
                {
                  url: 'http://hl7.org/fhir/StructureDefinition/operationdefinition-allowed-type',
                  valueUri: 'id',
                },
              ],
              name: 'value',
              use: 'out',
              min: 1,
              max: '1',
              documentation: 'The value for this product',
              type: 'Element',
            },
          ],
        },
        {
          name: 'originMap',
          use: 'out',
          min: 0,
          max: '1',
          documentation: 'The canonical reference to the concept map from which this mapping comes from',
          type: 'uri',
        },
      ],
    },
  ],
};

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
    return findTerminologyResource<ConceptMap>(repo, 'ConceptMap', params.url);
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
    .column('id')
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
    .where('sourceCode', 'IN', codes)
    .orderBy('id');

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
        for (const otherMatch of results.match ?? EMPTY) {
          matches.push({ ...otherMatch, source: unmapped.url });
        }
      }
    }
  }
}

function parseDatabaseRows(rows: any[]): ConceptMapTranslateMatch[] {
  const matches: ConceptMapTranslateMatch[] = [];
  let currentMappingId: string | undefined;
  let match: ConceptMapTranslateMatch | undefined;

  for (const { id, targetSystem, targetCode, targetDisplay, relationship, kind, uri, type, value } of rows) {
    if (id !== currentMappingId) {
      if (match) {
        matches.push(match);
      }
      match = {
        equivalence: relationship ?? EQUIVALENT,
        concept: { system: targetSystem, code: targetCode, display: targetDisplay ?? undefined },
      };
      currentMappingId = id;
    }

    if (kind && match) {
      const propertyName = kind as 'property' | 'dependsOn' | 'product';
      const attribute: ConceptMapTranslateMatchAttribute = {
        attribute: uri,
        value: { type, value: JSON.parse(value) },
      };
      match[propertyName] = append(match[propertyName], attribute);
    }
  }
  if (match) {
    matches.push(match);
  }

  matches.sort(sortMatches);
  return matches;
}

function sortMatches(a: ConceptMapTranslateMatch, b: ConceptMapTranslateMatch): number {
  const aDeps =
    a.dependsOn
      ?.map((d) => `${d.attribute}|${d.value.value}`)
      .sort()
      .join(',') ?? '';
  const bDeps =
    b.dependsOn
      ?.map((d) => `${d.attribute}|${d.value.value}`)
      .sort()
      .join(',') ?? '';
  if (aDeps < bDeps) {
    return -1;
  } else if (aDeps > bDeps) {
    return 1;
  }

  const aConcept = `${a.concept?.system ?? ''}|${a.concept?.code ?? ''}`;
  const bConcept = `${b.concept?.system ?? ''}|${b.concept?.code ?? ''}`;
  if (aConcept < bConcept) {
    return -1;
  } else if (aConcept > bConcept) {
    return 1;
  }

  return 0;
}
