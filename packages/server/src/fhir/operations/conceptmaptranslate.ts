import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { Operator, allOk, badRequest, notFound } from '@medplum/core';
import { Request, Response } from 'express';
import { getOperationDefinition } from './definitions';
import { CodeableConcept, Coding, ConceptMap, ConceptMapGroup, OperationOutcome } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { sendOutcome } from '../outcomes';

const operation = getOperationDefinition('ConceptMap', 'translate');

type ConceptMapTranslateParameters = {
  url?: string;
  source?: string;
  code?: string;
  system?: string;
  coding?: Coding;
  codeableConcept?: CodeableConcept;
  targetsystem?: string;
};

type Match = {
  equivalence?: string;
  concept?: Coding;
};

type ConceptMapTranslateOutput = {
  result: boolean;
  message?: string;
  match?: Match[];
};

export async function conceptMapTranslateHandler(req: Request, res: Response): Promise<void> {
  const params = parseInputParameters<ConceptMapTranslateParameters>(operation, req);

  const map = await lookupConceptMap(params, req.params.id);
  if (isOutcome(map)) {
    sendOutcome(res, map);
    return;
  } else if (!map.group) {
    sendOutcome(res, badRequest('ConceptMap does not specify a mapping group', 'ConceptMap.group'));
    return;
  }

  const sourceCodes = constructSourceSet(params);
  if (isOutcome(sourceCodes)) {
    sendOutcome(res, sourceCodes);
    return;
  }

  const matches = translateCodes(
    sourceCodes,
    params.targetsystem ? map.group.filter((g) => g.target === params.targetsystem) : map.group
  );
  const result = matches.length > 0;
  await sendOutputParameters(operation, res, allOk, {
    result,
    match: result ? matches : undefined,
  } as ConceptMapTranslateOutput);
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

function translateCodes(sourceCodes: Record<string, string[]>, groups: ConceptMapGroup[]): Match[] {
  const matches: Match[] = [];
  for (const [system, codes] of Object.entries(sourceCodes)) {
    for (const group of groups.filter((g) => (g.source ?? '') === system)) {
      let mappings: Match[] | undefined = group.element
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

function isOutcome(obj: any): obj is OperationOutcome {
  return obj.resourceType === 'OperationOutcome';
}

function handleUnmappedCodes(codes: string[], group: ConceptMapGroup): Match[] | undefined {
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
