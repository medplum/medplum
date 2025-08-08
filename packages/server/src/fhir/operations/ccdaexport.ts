// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { convertCcdaToXml, convertFhirToCcda } from '@medplum/ccda';
import { allOk, ContentType } from '@medplum/core';
import { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import { Binary, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getPatientSummary, operation as patientSummaryOperation, PatientSummaryParameters } from './patientsummary';
import { parseInputParameters } from './utils/parameters';

export const operation = {
  ...patientSummaryOperation,
  id: 'ccda-export',
  name: 'C-CDA Export',
  title: 'C-CDA Export',
  code: 'ccda-export',
  parameter: [{ name: 'type', use: 'in', min: 0, max: '1', type: 'code' }, ...patientSummaryOperation.parameter],
} satisfies OperationDefinition;

/**
 * C-CDA export operation parameters.
 *
 * Currently, these are the same as PatientSummaryParameters.
 */
export interface CcdaExportParameters extends PatientSummaryParameters {
  /**
   * Type of C-CDA document to generate.
   */
  type?: 'referral' | 'discharge' | 'summary';
}

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

  // Generate the patient summary bundle
  const summaryBundle = await getPatientSummary(ctx, { reference: `Patient/${id}` }, params);

  // Convert the summary bundle to C-CDA
  const ccda = convertFhirToCcda(summaryBundle, { type: params.type });

  // Convert C-CDA to XML
  const xmlString = convertCcdaToXml(ccda);

  // To workaround FHIR router, we conver this to a FHIR Binary
  // See `sendFhirResponse` in `packages/server/src/fhir/response.ts`
  const xmlBinary: Binary = {
    resourceType: 'Binary',
    contentType: ContentType.CDA_XML,
    data: Buffer.from(xmlString).toString('base64'),
  };

  return [allOk, xmlBinary, { forceRawBinaryResponse: true }];
}
