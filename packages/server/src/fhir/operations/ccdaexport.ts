import { convertCcdaToXml, convertFhirToCcda } from '@medplum/ccda';
import { allOk, ContentType } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientSummary, operation, PatientSummaryParameters } from './patientsummary';
import { parseInputParameters } from './utils/parameters';

/**
 * C-CDA export operation parameters.
 *
 * Currently, these are the same as PatientSummaryParameters.
 */
export type CcdaExportParameters = PatientSummaryParameters;

/**
 * Handles a C-CDA export request.
 *
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function ccdaExportHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  const params = parseInputParameters<CcdaExportParameters>(operation, req);

  // First read the patient to verify access
  const patient = await ctx.repo.readResource<Patient>('Patient', id);

  // Then read all of the patient data
  const summaryBundle = await getPatientSummary(ctx.repo, patient, params);

  // Convert the summary bundle to C-CDA
  const ccda = convertFhirToCcda(summaryBundle);

  // Convert C-CDA to XML
  const xmlString = convertCcdaToXml(ccda);

  // To workaround FHIR router, we conver this to a FHIR Binary
  // See `sendFhirResponse` in `packages/server/src/fhir/response.ts`
  const xmlBinary: Binary = {
    resourceType: 'Binary',
    contentType: ContentType.CDA_XML,
    data: Buffer.from(xmlString).toString('base64'),
  };

  return [allOk, xmlBinary];
}
