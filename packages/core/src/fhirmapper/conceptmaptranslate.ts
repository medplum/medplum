// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept, Coding, ConceptMap, ConceptMapGroup } from '@medplum/fhirtypes';
import { OperationOutcomeError, badRequest } from '../outcomes';
import type { TypedValue } from '../types';
import { append } from '../utils';

export interface ConceptMapTranslateParameters {
  url?: string;
  source?: string;
  code?: string;
  system?: string;
  coding?: Coding;
  codeableConcept?: CodeableConcept;
  targetsystem?: string;
}

export interface ConceptMapTranslateMatch {
  equivalence?: string;
  concept?: Coding;
  property?: ConceptMapTranslateMatchAttribute[];
  dependsOn?: ConceptMapTranslateMatchAttribute[];
  product?: ConceptMapTranslateMatchAttribute[];
  source?: string;
}

export interface ConceptMapTranslateMatchAttribute {
  key: string;
  value: TypedValue;
}

export interface ConceptMapTranslateOutput {
  result: boolean;
  message?: string;
  match?: ConceptMapTranslateMatch[];
}

export function conceptMapTranslate(map: ConceptMap, params: ConceptMapTranslateParameters): ConceptMapTranslateOutput {
  if (!map.group) {
    throw new OperationOutcomeError(badRequest('ConceptMap does not specify a mapping group', 'ConceptMap.group'));
  }

  const sourceCodes = indexConceptMapCodings(params);
  const matches = translateCodes(
    sourceCodes,
    params.targetsystem ? map.group.filter((g) => g.target === params.targetsystem) : map.group
  );

  const result = matches.length > 0;

  return {
    result,
    match: result ? matches : undefined,
  };
}

export function indexConceptMapCodings(params: ConceptMapTranslateParameters): Record<string, string[]> {
  const results: Record<string, string[]> = Object.create(null);
  if (params.code && !params.coding && !params.codeableConcept) {
    if (!params.system) {
      throw new OperationOutcomeError(badRequest(`System parameter must be provided with code`));
    }
    results[params.system] = [params.code];
  } else if (params.coding && !params.code && !params.codeableConcept) {
    if (params.coding.code) {
      results[params.coding.system ?? ''] = [params.coding.code];
    }
  } else if (params.codeableConcept && !params.code && !params.coding) {
    for (const { system, code } of params.codeableConcept.coding ?? []) {
      if (code) {
        results[system ?? ''] = append(results[system ?? ''], code);
      }
    }
  } else if (params.code || params.coding || params.codeableConcept) {
    throw new OperationOutcomeError(badRequest('Ambiguous input: multiple source codings provided'));
  } else {
    throw new OperationOutcomeError(badRequest('Source Coding (system + code) must be specified'));
  }
  return results;
}

function translateCodes(sourceCodes: Record<string, string[]>, groups: ConceptMapGroup[]): ConceptMapTranslateMatch[] {
  const matches: ConceptMapTranslateMatch[] = [];
  for (const [system, codes] of Object.entries(sourceCodes)) {
    for (const group of groups.filter((g) => (g.source ?? '') === system)) {
      let mappings: ConceptMapTranslateMatch[] | undefined = group.element
        ?.filter((m) => codes.includes(m.code as string))
        .flatMap(
          (m) =>
            m.target?.map((target) => ({
              equivalence: target.equivalence,
              concept: {
                system: group.target,
                code: target.code,
                display: target.display,
              },
            })) ?? []
        );

      if (!mappings?.length) {
        mappings = handleUnmappedCodes(codes, group);
      }
      if (mappings) {
        matches.push(...mappings);
      }
    }
  }
  return matches;
}

function handleUnmappedCodes(codes: string[], group: ConceptMapGroup): ConceptMapTranslateMatch[] | undefined {
  switch (group.unmapped?.mode) {
    case 'provided':
      return codes.map((code) => ({
        equivalence: 'equal',
        concept: { system: group.target, code },
      }));
    case 'fixed':
      return [
        {
          equivalence: 'equivalent',
          concept: {
            system: group.target,
            code: group.unmapped.code,
            display: group.unmapped.display,
          },
        },
      ];
    default:
      return undefined;
  }
}
