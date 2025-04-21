import { allOk, badRequest, getReferenceString, normalizeErrorString } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Claim, Media, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { createPdf } from '../../util/pdf';
import { getClaimPDFDocDefinition } from './utils/cms1500pdf';
import { getBinaryStorage } from '../../storage/loader';

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
      use: 'out',
      name: 'return',
      type: 'Media',
      min: 1,
      max: '1',
      documentation: 'A Media resource containing the PDF document',
    },
  ],
};

/**
 * Handles HTTP requests for the Claim $export operation.
 *
 * Reads the claim and generates a PDF document based on its contents.
 * Returns a Binary resource containing the PDF document directly.
 *
 * Endpoint:
 * [fhir base]/Claim/{id}/$export
 *
 * @param req - The FHIR request.
 * @returns The FHIR response with a Binary resource containing the PDF.
 */
export async function claimExportHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const claimId = req.params.id;
  if (!claimId) {
    return [badRequest('Claim ID is required')];
  }

  try {
    const claim = await repo.readResource<Claim>('Claim', claimId);
    const docDefinition = await getClaimPDFDocDefinition(claim);
    const pdfBuffer = await createPdf(docDefinition);
    const binary = await repo.createResource<Binary>({
      resourceType: 'Binary',
      contentType: 'application/pdf',
    });
    await getBinaryStorage().writeBinary(binary, 'cms-1500.pdf', 'application/pdf', pdfBuffer.toString('base64'));

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
