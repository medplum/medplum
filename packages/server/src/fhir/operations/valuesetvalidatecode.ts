// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { OperationOutcomeError, allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  CodeSystem,
  CodeSystemProperty,
  CodeableConcept,
  Coding,
  ValueSet,
  ValueSetComposeInclude,
  ValueSetComposeIncludeFilter,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode } from '../../database';
import { validateCoding } from './codesystemvalidatecode';
import { getOperationDefinition } from './definitions';
import { hydrateCodeSystemProperties } from './expand';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import {
  addPropertyFilter,
  findAncestor,
  findTerminologyResource,
  getParentProperty,
  selectCoding,
} from './utils/terminology';

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
// http://hl7.org/fhir/R4/valueset-operation-validate-code.html

export async function valueSetValidateOperation(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ValueSetValidateCodeParameters>(operation, req);

  let valueSet: ValueSet;
  if (req.params.id) {
    valueSet = await getAuthenticatedContext().repo.readResource<ValueSet>('ValueSet', req.params.id);
  } else if (params.url) {
    valueSet = await findTerminologyResource<ValueSet>('ValueSet', params.url);
  } else {
    return [badRequest('No ValueSet specified')];
  }

  const codings: Coding[] = [];
  if (params.system && params.code) {
    codings.push({ system: params.system, code: params.code, display: params.display });
  } else if (params.coding) {
    codings.push(params.coding);
  } else if (params.codeableConcept?.coding) {
    codings.push(...params.codeableConcept.coding);
  } else {
    return [badRequest('No coding specified')];
  }

  const found = await validateCodingInValueSet(valueSet, codings);

  const output = {
    result: Boolean(found) && (!params.display || found?.display === params.display),
    display: found?.display,
  };

  return [allOk, buildOutputParameters(operation, output)];
}

export async function validateCodingInValueSet(valueSet: ValueSet, codings: Coding[]): Promise<Coding | undefined> {
  let found: Coding | undefined;
  if (valueSet.expansion && !valueSet.expansion.parameter) {
    found = valueSet.expansion.contains?.find((e) => codings.some((c) => e.system === c.system && e.code === c.code));
  } else if (valueSet.compose) {
    for (const include of valueSet.compose.include) {
      found = await findIncludedCode(include, ...codings);
      if (found) {
        break;
      }
    }
  }

  const systemUrl = found?.system ?? valueSet.compose?.include?.[0]?.system;
  if (found && systemUrl) {
    const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', systemUrl).catch(() => undefined);
    return validateCoding(codeSystem && codeSystem.content !== 'example' ? codeSystem : systemUrl, found);
  }
  return undefined;
}

async function findIncludedCode(include: ValueSetComposeInclude, ...codings: Coding[]): Promise<Coding | undefined> {
  if (!include.system) {
    throw new OperationOutcomeError(
      badRequest('Missing system URL for ValueSet include', 'ValueSet.compose.include.system')
    );
  }

  const candidates = codings.filter((c) => c.code && (!c.system || c.system === include.system)) as (Coding & {
    code: string;
  })[];
  if (!candidates.length) {
    return undefined;
  }

  if (include.concept) {
    return candidates.find((c) => include.concept?.some((i) => i.code === c.code));
  } else if (include.filter) {
    const codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', include.system);
    const { repo } = getAuthenticatedContext();
    const db = repo.getDatabaseClient(DatabaseMode.READER);
    await hydrateCodeSystemProperties(db, codeSystem);

    for (const coding of candidates) {
      const filterResults = await Promise.all(
        include.filter.map((filter) => satisfies(coding.code, filter, codeSystem))
      );
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
  code: string,
  filter: ValueSetComposeIncludeFilter,
  codeSystem: WithId<CodeSystem>
): Promise<boolean> {
  const { logger, repo } = getAuthenticatedContext();
  const db = repo.getDatabaseClient(DatabaseMode.READER);
  let query = selectCoding(codeSystem.id, code);

  switch (filter.op) {
    case '=':
    case 'in': {
      const property = codeSystem.property?.find((p) => p.code === filter.property);
      if (!property?.id) {
        return false;
      }
      query = addPropertyFilter(query, filter, property as WithId<CodeSystemProperty>);
      break;
    }
    case 'is-a':
    case 'descendent-of': {
      if (filter.op !== 'is-a') {
        query.where('code', '!=', filter.value);
      }

      // Recursively find parents until one matches
      const parentProperty = getParentProperty(codeSystem);
      if (!parentProperty.id) {
        return false;
      }
      query = findAncestor(query, codeSystem, parentProperty as WithId<CodeSystemProperty>, filter.value);
      break;
    }
    default:
      logger.warn('Unknown filter type in ValueSet', { filter: filter.op });
      return false; // Unknown filter type, don't make DB query with incorrect filters
  }

  const results = await query.execute(db);
  return results.length > 0;
}
