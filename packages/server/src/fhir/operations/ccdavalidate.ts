// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { validateCcda } from '@medplum/ccda';
import { allOk, indexStructureDefinitionBundle } from '@medplum/core';
import { readJson } from '@medplum/definitions';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationOutcome } from '@medplum/fhirtypes';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

export const ccdaValidateOperation = makeOperationDefinition(
  { scope: 'system' },
  {
    name: 'CcdaValidate',
    code: 'ccda-validate',
    affectsState: false,
    parameter: [
      { use: 'in', name: 'document', type: 'string', min: 1, max: '1' },
      { use: 'out', name: 'return', type: 'OperationOutcome', min: 1, max: '1' },
    ],
  }
);

interface CcdaValidateParameters {
  document: string;
}

/**
 * Handles the system-level $ccda-validate operation, which validates C-CDA XML with `validateCcda`.
 * @param req - The FHIR request.
 * @returns The FHIR response, an OperationOutcome with the validation issues.
 */
export async function ccdaValidateHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<CcdaValidateParameters>(ccdaValidateOperation, req);
  loadCdaDefinitions();
  const issues = validateCcda(params.document);
  const outcome: OperationOutcome = { resourceType: 'OperationOutcome', issue: issues.length ? issues : allOk.issue };
  return [allOk, outcome];
}

let cdaDefinitionsLoaded = false;

// The CDA logical model is loaded on first use, since most servers never validate C-CDA
function loadCdaDefinitions(): void {
  if (!cdaDefinitionsLoaded) {
    indexStructureDefinitionBundle(readJson('fhir/cda/hl7.cda.uv.core-2.0.0-sd.json'));
    cdaDefinitionsLoaded = true;
  }
}
