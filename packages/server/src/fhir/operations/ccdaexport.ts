import { convertCcdaToXml, convertFhirToCcda } from '@medplum/ccda';
import { allOk, ContentType } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, OperationDefinition, OperationDefinitionParameter, Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientSummary, PatientSummaryParameters } from './patientsummary';
import { parseInputParameters } from './utils/parameters';

const operation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'summary',
  name: 'CcdaExport',
  title: 'C-CDA Export',
  status: 'active',
  kind: 'operation',
  affectsState: false,
  code: 'summary',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: true,
  parameter: [
    ['start', 'in', 0, 1, 'date'],
    ['end', 'in', 0, 1, 'date'],
    ['_since', 'in', 0, 1, 'instant'],
    ['identifier', 'in', 0, 1, 'string'],
    ['profile', 'in', 0, 1, 'canonical'],
    ['return', 'out', 0, 1, 'Bundle'],
  ].map(([name, use, min, max, type]) => ({ name, use, min, max, type }) as OperationDefinitionParameter),
};

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
