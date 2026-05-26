// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest, normalizeErrorString } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { tryCustomOperation } from './custom';
import { makeOperationDefinition } from './definitions';
import { parseInputParameters } from './utils/parameters';

type Processor = 'stedi' | 'candid';

const SECRET_NAME_FOR_PROCESSOR: Record<Processor, string> = {
  stedi: 'STEDI_CLAIM_API_KEY',
  candid: 'CANDID_SECRET_ID',
};

const SUB_OPERATION_FOR_PROCESSOR: Record<Processor, string> = {
  stedi: 'stedi-submit-claim',
  candid: 'candid-submit-claim',
};

export const operation = makeOperationDefinition(
  { scope: 'type-and-instance', resource: 'Claim' },
  {
    name: 'claim-submit',
    code: 'submit',
    parameter: [
      {
        use: 'in',
        name: 'processor',
        type: 'code',
        min: 0,
        max: '1',
        documentation:
          "The claim processor to submit to ('stedi' or 'candid'). If omitted, resolved from project secrets.",
      },
      {
        use: 'in',
        name: 'resource',
        type: 'Claim',
        min: 0,
        max: '1',
        documentation: 'The Claim to submit (for type-level POST).',
      },
      {
        use: 'out',
        name: 'return',
        type: 'ClaimResponse',
        min: 1,
        max: '1',
        documentation: 'The ClaimResponse returned by the underlying processor operation.',
      },
    ],
  }
);

interface ClaimSubmitInput {
  processor?: string;
  resource?: Claim;
}

/**
 * Handles the Claim $submit operation.
 *
 * Resolves a target processor and dispatches an internal POST to the corresponding
 * processor-specific operation ($stedi-submit-claim or $candid-submit-claim) with the
 * Claim resource as the request body.
 *
 * Resolution order:
 *   1. 'processor' parameter in the request body ('stedi' or 'candid').
 *   2. Project secrets: STEDI_CLAIM_API_KEY (→ stedi), then CANDID_SECRET_ID (→ candid).
 *
 * Endpoints:
 *   POST /Claim/$submit                (Claim passed via the 'resource' input parameter)
 *   POST /Claim/:id/$submit            (Claim read from the URL)
 *
 * @param req - The FHIR request.
 * @returns The FHIR response from the underlying processor operation.
 */
export async function claimSubmitHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const params = parseInputParameters<ClaimSubmitInput>(operation, req);

    let processor: Processor | undefined;
    if (params.processor) {
      const normalized = params.processor.toLowerCase();
      if (!(normalized in SECRET_NAME_FOR_PROCESSOR)) {
        return [badRequest(`Invalid processor '${params.processor}': must be 'stedi' or 'candid'.`)];
      }
      processor = normalized as Processor;
    } else {
      processor = processorFromSecrets();
    }

    if (!processor) {
      return [
        badRequest(
          "No claim processor configured. Pass 'processor' in the body, or set STEDI_CLAIM_API_KEY or CANDID_SECRET_ID in project secrets."
        ),
      ];
    }

    const { repo } = getAuthenticatedContext();

    const claimId = (req.params as { id?: string } | undefined)?.id;
    let claim: Claim;
    if (claimId) {
      claim = await repo.readResource<Claim>('Claim', claimId);
    } else if (params.resource) {
      claim = params.resource;
    } else {
      return [badRequest("Missing Claim payload: pass the 'resource' input parameter, or POST to /Claim/:id/$submit.")];
    }

    const subOpCode = SUB_OPERATION_FOR_PROCESSOR[processor];
    const subRequest: FhirRequest = {
      ...req,
      url: `/Claim/$${subOpCode}`,
      body: claim,
    };
    const result = await tryCustomOperation(subRequest, repo);
    if (result) {
      return result;
    }
    return [
      badRequest(
        `Claim processor '${processor}' is not configured: no OperationDefinition with code '${subOpCode}' was found.`
      ),
    ];
  } catch (err) {
    return [badRequest(normalizeErrorString(err))];
  }
}

function processorFromSecrets(): Processor | undefined {
  const { project } = getAuthenticatedContext();
  for (const processor of Object.keys(SECRET_NAME_FOR_PROCESSOR) as Processor[]) {
    if (project.secret?.some((s) => s.name === SECRET_NAME_FOR_PROCESSOR[processor])) {
      return processor;
    }
  }
  return undefined;
}
