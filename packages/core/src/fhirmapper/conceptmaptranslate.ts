import { CodeableConcept, Coding, ConceptMap, ConceptMapGroup, OperationOutcome } from '@medplum/fhirtypes';
import { OperationOutcomeError, badRequest, isOperationOutcome } from '../outcomes';

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

  const sourceCodes = constructSourceSet(params);
  if (isOperationOutcome(sourceCodes)) {
    throw new OperationOutcomeError(sourceCodes);
  }

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

function constructSourceSet(params: ConceptMapTranslateParameters): Record<string, string[]> | OperationOutcome {
  if (params.code && !params.coding && !params.codeableConcept) {
    if (params.system === undefined) {
      return badRequest(`Missing required 'system' input parameter with 'code' parameter`);
    }
    return { [params.system]: [params.code] };
  } else if (params.coding && !params.code && !params.codeableConcept) {
    return { [params.coding.system ?? '']: [params.coding.code ?? ''] };
  } else if (params.codeableConcept && !params.code && !params.coding) {
    return indexCodes(params.codeableConcept);
  } else if (params.code || params.coding || params.codeableConcept) {
    return badRequest('Ambiguous input: multiple source codings provided');
  } else {
    return badRequest(
      `No source provided: 'code'+'system', 'coding', or 'codeableConcept' input parameter is required`
    );
  }
}

function indexCodes(concept: CodeableConcept): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null);
  if (!concept.coding?.length) {
    return result;
  }

  for (const { system, code } of concept.coding) {
    if (!code) {
      continue;
    }
    const key = system ?? '';
    result[key] = result[key] ? [...result[key], code] : [code];
  }
  return result;
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
