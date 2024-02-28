import { asyncWrap } from '../../async';
import { Request, Response } from 'express';
import { parseInputParameters, sendOutputParameters } from './utils/parameters';
import { getOperationDefinition } from './definitions';
import {
  CodeSystem,
  CodeableConcept,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
} from '@medplum/fhirtypes';
import { sendOutcome } from '../outcomes';
import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import { addPropertyFilter, findTerminologyResource } from './utils/terminology';
import { validateCode } from './codesystemvalidatecode';
import { Column, SelectQuery } from '../sql';
import { getAuthenticatedContext } from '../../context';

const operation = getOperationDefinition('ValueSet', 'validate-code');

type ValueSetValidateCodeParameters = {
  url?: string;
  code?: string;
  system?: string;
  coding?: Coding;
  codeableConcept?: CodeableConcept;
  display?: string;
  abstract?: boolean;
};

// Implements FHIR "Value Set Validation"
// http://hl7.org/fhir/R4B/valueset-operation-validate-code.html

export const valueSetValidateOperation = asyncWrap(async (req: Request, res: Response) => {
  const params = parseInputParameters<ValueSetValidateCodeParameters>(operation, req);

  if (!params.url) {
    sendOutcome(res, badRequest('Missing ValueSet URL'));
    return;
  }

  const codings: Coding[] = [];
  if (params.system && params.code) {
    codings.push({ system: params.system, code: params.code, display: params.display });
  } else if (params.coding) {
    codings.push(params.coding);
  } else if (params.codeableConcept?.coding) {
    codings.push(...params.codeableConcept.coding);
  } else {
    sendOutcome(res, badRequest('No coding specified'));
    return;
  }

  const valueSet = await findTerminologyResource<ValueSet>('ValueSet', params.url);
  let found: Coding | undefined;
  if (valueSet.expansion && !valueSet.expansion.parameter) {
    found = valueSet.expansion.contains?.find((e) => codings.some((c) => e.system === c.system && e.code === c.code));
  } else if (valueSet.compose) {
    for (const include of valueSet.compose.include) {
      found = findIncludedCode(include, ...codings);
      if (found) {
        break;
      }
    }
  }

  if (found) {
    const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', found.system as string);
    found = (await validateCode(codeSystem, found.code as string)) ?? found;
  }

  await sendOutputParameters(req, res, operation, allOk, {
    result: Boolean(found) && (!params.display || found?.display === params.display),
    display: found?.display,
  });
});

async function findIncludedCode(
  include: ValueSetComposeInclude,
  ...codings: Coding[]
): Promise<{ coding: Coding; codeSystem: CodeSystem } | undefined> {
  if (!include.system) {
    throw new OperationOutcomeError(
      badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
    );
  }

  const candidates = codings.filter((c) => c.system === include.system);
  if (!candidates.length) {
    return undefined;
  }

  if (include.concept) {
    const found = codings.find((c) => include.concept?.some((i) => i.code === c.code));
    return checkCoding(found);
  } else if (include.filter) {
    const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', include.system);
    for (const coding of codings) {
      const filterResults = await Promise.all(include.filter.map((filter) => satisfies(coding, filter, codeSystem)));
      if (filterResults.every((r) => r)) {
        return checkCoding(coding, codeSystem);
      }
    }
  }
  return undefined;
}

async function satisfies(
  coding: Coding,
  filter: ValueSetComposeIncludeFilter,
  codeSystem: CodeSystem
): Promise<boolean> {
  const ctx = getAuthenticatedContext();
  let query = new SelectQuery('Coding')
    .where(new Column('Coding', 'system'), '=', codeSystem.id)
    .where(new Column('Coding', 'code'), '=', coding.code);

  switch (filter.op) {
    case '=':
      query = addPropertyFilter(query, filter.property, filter.value, true);
      break;
    default:
      ctx.logger.warn('Unknown filter type in ValueSet', { filter: filter.op });
      return false; // Unknown filter type, don't make DB query with incorrect filters
  }

  const results = await query.execute(ctx.repo.getDatabaseClient());
  return results.length > 0;
}

async function checkCoding(
  coding: Coding | undefined,
  codeSystem?: CodeSystem
): Promise<{ coding: Coding; codeSystem: CodeSystem } | undefined> {
  if (!coding) {
    return undefined;
  }
  if (!codeSystem) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', coding.system as string);
  }
  coding = (await validateCode(codeSystem, coding.code as string)) ?? coding;
  return { coding, codeSystem };
}
