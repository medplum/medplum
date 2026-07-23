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
import type { Repository } from '../repo';
import { repoAccess } from '../repository/access-tracker';
import { Column, SelectQuery, SqlFunction } from '../sql';
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
  const repo = getAuthenticatedContext().repo;

  let valueSet: ValueSet;
  if (req.params.id) {
    valueSet = await repo.readResource<ValueSet>('ValueSet', req.params.id);
  } else if (params.url) {
    valueSet = await findTerminologyResource<ValueSet>(repo, 'ValueSet', params.url);
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

  const systemUrl = found?.system ?? valueSet.compose?.include?.[0]?.system;
  if (found && systemUrl) {
    const codeSystem = await findTerminologyResource<CodeSystem>(repo, 'CodeSystem', systemUrl).catch(() => undefined);
    return validateCoding(codeSystem && codeSystem.content !== 'example' ? codeSystem : systemUrl, found);
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

  const candidates = codings.filter((c) => c.code && (!c.system || c.system === include.system)) as (Coding & {
    code: string;
  })[];
  if (!candidates.length) {
    return undefined;
  }

  if (include.concept) {
    return candidates.find((c) => include.concept?.some((i) => i.code === c.code));
  } else if (include.filter) {
    const codeSystem = await findTerminologyResource<CodeSystem>(repo, 'CodeSystem', include.system);
    // used on non resource type tables derived from CodeSystem
    const db = repo.getDatabaseClient(
      repoAccess.sqlRead('CodeSystem', { source: 'valuesetvalidatecode.includeHasCoding' })
    );
    await hydrateCodeSystemProperties(db, codeSystem);

    // Validate every candidate code against all filters in a single query, rather than one query per candidate
    // (and previously one per filter). The first candidate present in the result, in input order, is the match.
    const query = buildFilterQuery(
      candidates.map((c) => c.code),
      include.filter,
      codeSystem
    );
    if (query) {
      const matched = new Set<string>((await query.execute(db)).map((row) => row.code));
      const found = candidates.find((c) => matched.has(c.code));
      if (found) {
        return found;
      }
    }
  } else {
    return candidates[0]; // Default pass when any code from system is acceptable
  }

  return undefined;
}

/**
 * Builds a single query selecting whichever of the given codes satisfy every filter, combining the filters as
 * AND-ed predicates. Returns undefined when a filter can never be satisfied (unknown op or missing property), in
 * which case no code belongs to the include.
 * @param codes - The codes being validated; all are checked in one query.
 * @param filters - The filters from the ValueSet include, all of which must be satisfied.
 * @param codeSystem - The CodeSystem the codes are drawn from, with hydrated property IDs.
 * @returns A query selecting the codes that satisfy all filters, or undefined if none can.
 */
function buildFilterQuery(
  codes: string[],
  filters: ValueSetComposeIncludeFilter[],
  codeSystem: WithId<CodeSystem>
): SelectQuery | undefined {
  const { logger } = getAuthenticatedContext();
  const query = selectCoding(codeSystem.id, ...codes);

  for (const filter of filters) {
    switch (filter.op) {
      case '=':
      case 'in': {
        const property = codeSystem.property?.find((p) => p.code === filter.property);
        if (!property?.id) {
          return undefined;
        }
        addPropertyFilter(query, filter, property as WithId<CodeSystemProperty>);
        break;
      }
      case 'is-a':
      case 'descendent-of': {
        const parentProperty = getParentProperty(codeSystem);
        if (!parentProperty.id) {
          return undefined;
        }
        // Correlated EXISTS walking up from the candidate's own row, so the ancestry check composes with the
        // other filters on the same query rather than requiring a separate round-trip.
        const base = new SelectQuery('Coding', undefined, 'origin')
          .column('id')
          .column('code')
          .column('synonymOf')
          .where(new Column('origin', 'system'), '=', codeSystem.id)
          .where(new Column('origin', 'code'), '=', new Column(query.effectiveTableName, 'code'));
        const ancestorQuery = findAncestor(
          base,
          codeSystem,
          parentProperty as WithId<CodeSystemProperty>,
          filter.value
        );
        query.whereExpr(new SqlFunction('EXISTS', [ancestorQuery]));
        if (filter.op !== 'is-a') {
          query.where('code', '!=', filter.value);
        }
        break;
      }
      default:
        logger.warn('Unknown filter type in ValueSet', { filter: filter.op });
        return undefined; // Unknown filter type, don't make DB query with incorrect filters
    }
  }

  return query;
}
