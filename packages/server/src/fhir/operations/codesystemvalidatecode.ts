// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { CodeSystem, Coding } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { getOperationDefinition } from './definitions';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';
import { findTerminologyResource, selectCoding } from './utils/terminology';

const operation = getOperationDefinition('CodeSystem', 'validate-code');

type CodeSystemValidateCodeParameters = {
  url?: string;
  version?: string;
  code?: string;
  coding?: Coding;
};

/**
 * Handles a request to validate whether a code belongs to a CodeSystem.
 *
 * Endpoint - CodeSystem resource type
 *   [fhir base]/CodeSystem/$validate-code
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function codeSystemValidateCodeHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CodeSystemValidateCodeParameters>(operation, req);

  let codeSystem: WithId<CodeSystem> | undefined;
  const url = params.url ?? params.coding?.system;
  if (req.params.id) {
    codeSystem = await getAuthenticatedContext().repo.readResource<CodeSystem>('CodeSystem', req.params.id);
  } else if (url) {
    codeSystem = await findTerminologyResource<CodeSystem>('CodeSystem', url, { version: params.version }).catch(
      () => undefined
    );
  }
  if (!codeSystem && !url) {
    return [badRequest('No code system specified')];
  }

  let coding: Coding;
  if (params.coding) {
    coding = params.coding;
  } else if (params.code) {
    coding = { system: url ?? codeSystem?.url, code: params.code };
  } else {
    return [badRequest('No coding specified')];
  }

  const result = await validateCoding((codeSystem ?? url) as WithId<CodeSystem> | string, coding);

  const output: Record<string, any> = Object.create(null);
  if (result) {
    output.result = true;
    output.display = result.display;
  } else {
    output.result = false;
  }
  return [allOk, buildOutputParameters(operation, output)];
}

export async function validateCoding(
  codeSystem: WithId<CodeSystem> | string,
  coding: Coding
): Promise<Coding | undefined> {
  if (typeof codeSystem === 'string') {
    // Fallback to validating system URL if full CodeSystem not available
    return coding.system === codeSystem ? coding : undefined;
  }
  return (await validateCodings(codeSystem, [coding]))[0];
}

export async function validateCodings(
  codeSystem: WithId<CodeSystem>,
  codings: Coding[]
): Promise<(Coding | undefined)[]> {
  const eligible: boolean[] = new Array(codings.length);
  const codesToQuery = new Set<string>();
  for (let i = 0; i < codings.length; i++) {
    const c = codings[i];
    if (c.system && c.system !== codeSystem.url) {
      continue;
    }
    if (c.code) {
      codesToQuery.add(c.code);
      eligible[i] = true;
    }
  }

  let result: any[] | undefined;
  if (codesToQuery.size > 0) {
    const query = selectCoding(codeSystem.id, ...codesToQuery);
    const db = getDatabasePool(DatabaseMode.READER);
    result = await query.execute(db);
  }

  return codings.map((c, idx) => {
    const row = eligible[idx] && result?.find((r: any) => r.code === c.code);
    return row ? { id: row.id, system: codeSystem.url, code: c.code, display: c.display ?? row.display } : undefined;
  });
}
