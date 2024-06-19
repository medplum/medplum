import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import {
  CodeSystem,
  CodeableConcept,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { Column, SelectQuery } from '../sql';
import { validateCoding } from './codesystemvalidatecode';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { addPropertyFilter, findAncestor, findTerminologyResource } from './utils/terminology';
import { Repository } from '../repo';

const operation = getOperationDefinition('ValueSet', 'validate-code');

export type ValueSetValidateCodeParameters = {
  url?: string;
  code?: string;
  system?: string;
  coding?: Coding;
  codeableConcept?: CodeableConcept;
  display?: string;
  abstract?: boolean;

  valueSetId?: string;
  repo?: Repository;
};

export type ValueSetValidateCodeOutput = {
  result: boolean;
  display?: string;
};

// Implements FHIR "Value Set Validation"
// http://hl7.org/fhir/R4/valueset-operation-validate-code.html

export async function valueSetValidateOperationHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const params = parseInputParameters<ValueSetValidateCodeParameters>(operation, req);

  let valueSet: ValueSet;
  if (req.params.id) {
    valueSet = await repo.readResource<ValueSet>('ValueSet', req.params.id);
  } else if (params.url) {
    const found = await findTerminologyResource<ValueSet>(repo, 'ValueSet', params.url);
    if (!found) {
      throw new OperationOutcomeError(badRequest(`ValueSet ${params.url} not found`));
    }
    valueSet = found;
  } else {
    throw new OperationOutcomeError(badRequest('No ValueSet specified'));
  }

  const codings: Coding[] = [];
  if (params.code) {
    codings.push({ system: params.system, code: params.code, display: params.display });
  } else if (params.coding) {
    codings.push(params.coding);
  } else if (params.codeableConcept?.coding) {
    codings.push(...params.codeableConcept.coding);
  } else {
    console.log(params);
    throw new OperationOutcomeError(badRequest('No coding specified'));
  }

  const found = await validateCodingInValueSet(repo, valueSet, codings);
  const output = {
    result: Boolean(found) && (!params.display || found?.display === params.display),
    display: found?.display,
  };

  return [allOk, buildOutputParameters(operation, output)];
}

export async function validateCodingInValueSet(
  repo: Repository,
  valueSet: ValueSet,
  codings: Coding[]
): Promise<Coding | undefined> {
  const implicitSystem = valueSet.compose?.include.length === 1 && valueSet.compose.include[0].system;
  if (implicitSystem) {
    // Ensure all Codings have a valid system URL
    for (const coding of codings) {
      if (!coding.system) {
        coding.system = implicitSystem;
      }
    }
  }

  let found: Coding | undefined;
  if (valueSet.expansion && !valueSet.expansion.parameter) {
    found = valueSet.expansion.contains?.find((e) => codings.some((c) => e.system === c.system && e.code === c.code));
  } else if (valueSet.compose) {
    for (const include of valueSet.compose.include) {
      found = await findIncludedCode(repo, include, ...codings);
      if (found) {
        break;
      }
    }
  }

  if (found) {
    // Validate that the code is actually valid in the code system
    const codeSystem = await findTerminologyResource<CodeSystem>(repo, 'CodeSystem', found.system as string);
    if (!codeSystem) {
      throw new OperationOutcomeError(badRequest(`CodeSystem ${found.system} not found`));
    }
    return codeSystem.content !== 'example' ? validateCoding(codeSystem, found) : found;
  }
  return undefined;
}

async function findIncludedCode(
  repo: Repository,
  include: ValueSetComposeInclude,
  ...codings: Coding[]
): Promise<Coding | undefined> {
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
    return candidates.find((c) => include.concept?.some((i) => i.code === c.code));
  } else if (include.filter) {
    const codeSystem = await findTerminologyResource<CodeSystem>(repo, 'CodeSystem', include.system);
    if (!codeSystem) {
      throw new OperationOutcomeError(badRequest(`CodeSystem ${include.system} not found`));
    }
    for (const coding of candidates) {
      const filterResults = await Promise.all(include.filter.map((filter) => satisfies(coding, filter, codeSystem)));
      if (filterResults.every((r) => r)) {
        return coding;
      }
    }
  } else {
    return candidates[0]; // Default pass when any code from system is acceptable
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
    .column('id')
    .column('code')
    .column('display')
    .where(new Column('Coding', 'system'), '=', codeSystem.id)
    .where(new Column('Coding', 'code'), '=', coding.code);

  switch (filter.op) {
    case '=':
      query = addPropertyFilter(query, filter.property, filter.value, true);
      break;
    case 'is-a':
      // Recursively find parents until one matches
      query = findAncestor(query, codeSystem, filter.value);
      break;
    default:
      ctx.logger.warn('Unknown filter type in ValueSet', { filter: filter.op });
      return false; // Unknown filter type, don't make DB query with incorrect filters
  }

  const results = await query.execute(ctx.repo.getDatabaseClient());
  return results.length > 0;
}
