import { allOk, badRequest, getReferenceString, normalizeErrorString } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Claim, Media, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { createPdf } from '../../util/pdf';
import { getClaimPDFDocDefinition } from './utils/cms1500pdf';
import { getBinaryStorage } from '../../storage/loader';
import path from 'node:path';
import fs from 'node:fs';
import { Readable } from 'node:stream';
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
    
    // Convert Buffer to Readable stream for writeBinary
    const readableStream = new Readable();
    readableStream.push(pdfBuffer);
    readableStream.push(null);
    
    await getBinaryStorage().writeBinary(binary, 'cms-1500.pdf', 'application/pdf', readableStream);
    
    // Create directory if it doesn't exist
    const outputDir = path.resolve(__dirname, '../../../output/claims');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate a unique filename using the claim ID and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `claim-${claimId}-${timestamp}.pdf`;
    const filePath = path.join(outputDir, filename);
    
    // Write the PDF to the file system
    fs.writeFileSync(filePath, pdfBuffer);
    console.log(`PDF saved to: ${filePath}`);

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
