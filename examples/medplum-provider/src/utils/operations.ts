// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { getExtension } from '@medplum/core';

/** Custom operation on Claim that submits a professional claim to Candid Health. */
export const CANDID_SUBMIT_CLAIM_OPERATION = 'candid-submit-claim';

/** Custom operation on Claim that submits a professional claim to Stedi. */
export const STEDI_SUBMIT_CLAIM_OPERATION = 'stedi-submit-claim';

const OPERATION_IMPLEMENTATION_EXTENSION =
  'https://medplum.com/fhir/StructureDefinition/operationDefinition-implementation';

/**
 * Whether a bot-backed custom operation is deployed in the current project.
 *
 * Mirrors the server's custom operation lookup: an OperationDefinition with the given code whose
 * implementation extension references a Bot. Operations that are not deployed return 404 when
 * invoked, so callers hide or disable the feature instead.
 *
 * @param medplum - The Medplum client.
 * @param code - The operation code without the leading `$`.
 * @returns True when the operation can be invoked.
 */
export async function isCustomOperationAvailable(medplum: MedplumClient, code: string): Promise<boolean> {
  const operation = await medplum.searchOne('OperationDefinition', { code });
  if (!operation) {
    return false;
  }
  const implementation = getExtension(operation, OPERATION_IMPLEMENTATION_EXTENSION)?.valueReference?.reference;
  return implementation?.startsWith('Bot/') ?? false;
}
