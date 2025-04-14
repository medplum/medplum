import { allOk, badRequest } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Claim, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { createPdf } from './utils/pdf';
import { getClaimPDFDocDefinition } from './utils/claimcms1500pdf';
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
      type: 'Binary', 
      min: 1, 
      max: '1',
      documentation: 'A Binary resource containing the PDF document'
    }
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
  
  // Get the claim ID from the request URL
  const claimId = req.params.id;
  if (!claimId) {
    return [badRequest('Claim ID is required')];
  }

  try {
    // Read the claim
    const claim = await repo.readResource<Claim>('Claim', claimId);
    
    // Generate the PDF document definition
    const docDefinition = await getClaimPDFDocDefinition(claim);
    
    // Create the PDF binary
    const pdfBuffer = await createPdf(docDefinition);
    const binary: Binary = {
      resourceType: 'Binary',
      contentType: 'application/pdf',
      data: pdfBuffer.toString('base64'),
    };
    
    // Return the Binary resource directly
    return [allOk, binary];
  } catch (error) {
    console.error('Error exporting claim:', error);
    return [badRequest(`Error exporting claim: ${(error as Error).message}`)];
  }
}