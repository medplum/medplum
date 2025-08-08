// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString, normalizeErrorString } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Claim, Media, OperationDefinition } from '@medplum/fhirtypes';
import { Readable } from 'stream';
import { getAuthenticatedContext } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import { createPdf } from '../../util/pdf';
import { getClaimPDFDocDefinition } from './utils/cms1500pdf';
import { parseInputParameters } from './utils/parameters';

/**
 * Operation definition for the Claim $export operation.
 * This operation exports a claim as a PDF document.
 */
export const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  name: 'claim-export',
  status: 'active',
  kind: 'operation',
  code: 'export',
  experimental: true,
  resource: ['Claim'],
  system: false,
  type: false,
  instance: true,
  parameter: [
    {
      use: 'in',
      name: 'resource',
      type: 'Resource',
      min: 1,
      max: '1',
      documentation: 'The claim to export',
    },
    {
      use: 'out',
      name: 'return',
      type: 'Media',
      min: 1,
      max: '1',
      documentation: 'A Media resource containing the PDF document',
    },
  ],
};

interface ClaimExportParameters {
  readonly resource: Claim;
}

/**
 * Common function to handle claim export operations.
 *
 * @param claim - The FHIR Claim resource.
 * @returns The FHIR response with a Media resource containing PDF reference.
 */
async function handleClaimExport(claim: Claim): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();

  try {
    // Generate PDF from claim
    const docDefinition = await getClaimPDFDocDefinition(claim);
    const pdfBuffer = await createPdf(docDefinition);

    // Create Binary resource
    const binary = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'application/pdf',
    });

    // Write PDF to binary storage
    const readableStream = new Readable();
    readableStream.push(pdfBuffer);
    readableStream.push(null);
    await getBinaryStorage().writeBinary(binary, 'cms-1500.pdf', 'application/pdf', readableStream);

    // Create Media resource
    const media: Media = {
      resourceType: 'Media',
      status: 'completed',
      subject: {
        reference: getReferenceString(claim.patient),
      },
      operator: {
        reference: getReferenceString(claim.provider),
      },
      issued: new Date().toISOString(),
      content: {
        contentType: 'application/pdf',
        url: getReferenceString(binary),
        title: 'cms-1500.pdf',
      },
    };

    return [allOk, media];
  } catch (error) {
    return [badRequest(normalizeErrorString(error))];
  }
}

/**
 * Handles HTTP GET requests for the Claim $export operation.
 *
 * Fetches the claim from the database and generates a PDF document based on its contents.
 *
 * Reads the claim and generates a PDF document based on its contents.
 * Returns a Binary resource containing the PDF document directly.
 *
 * Endpoint:
 *   [fhir base]/Claim/{id}/$export
 *
 * @param req - The FHIR request.
 * @returns The FHIR response with a Media resource containing PDF reference.
 */
export async function claimExportGetHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const claimId = req.params.id;

  if (!claimId) {
    return [badRequest('Claim ID is required')];
  }

  try {
    const claim = await repo.readResource<Claim>('Claim', claimId);
    return await handleClaimExport(claim);
  } catch (error) {
    return [badRequest(normalizeErrorString(error))];
  }
}

/**
 * Handles HTTP POST requests for the Claim $export operation.
 *
 * Reads the claim and generates a PDF document based on its contents.
 *
 * Returns a Binary resource containing the PDF document directly.
 *
 * Endpoint:
 *   [fhir base]/Claim/$export
 *
 * @param req - The FHIR request.
 * @returns The FHIR response with a Media resource containing PDF reference.
 */
export async function claimExportPostHandler(req: FhirRequest): Promise<FhirResponse> {
  try {
    const params = parseInputParameters<ClaimExportParameters>(operation, req);
    const claim: Claim = params.resource;

    if (!claim) {
      return [badRequest('The resource Claim is required')];
    }

    return await handleClaimExport(claim);
  } catch (error) {
    return [badRequest(normalizeErrorString(error))];
  }
}
