// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GuardDutyClient, SendObjectMalwareScanCommand } from '@aws-sdk/client-guardduty';
import { NoSuchKey } from '@aws-sdk/client-s3';
import { allOk, badRequest } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { S3Storage } from '../../cloud/aws/storage';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getBinaryStorage } from '../../storage/loader';
import { makeOperationDefinition } from './definitions';
import { buildOutputParameters } from './utils/parameters';

const operation = makeOperationDefinition(
  { scope: 'instance', resource: 'Binary' },
  {
    name: 'BinaryScan',
    code: 'scan',
    parameter: [{ use: 'out', name: 'return', type: 'OperationOutcome', min: 1, max: '1' }],
  }
);

/** Object tag written by GuardDuty Malware Protection for S3 once a scan finishes. */
export const MALWARE_SCAN_STATUS_TAG = 'GuardDutyMalwareScanStatus';

export const MALWARE_SCAN_STATUS_SYSTEM = 'https://medplum.com/fhir/CodeSystem/malware-scan-status';

/** Our code for "scan submitted, result pending"; every other code is a GuardDuty tag value. */
export const SCAN_REQUESTED = 'SCAN_REQUESTED';

type ScanResult = Pick<OperationOutcomeIssue, 'severity' | 'code'> & { text: string };

/**
 * Scan results that re-scanning would not change. GuardDuty bills every on-demand scan and does not
 * dedupe, so these short-circuit. `FAILED` and `ACCESS_DENIED` can be transient, so they are re-sent.
 */
const FINAL_RESULTS: Record<string, ScanResult> = {
  NO_THREATS_FOUND: { severity: 'information', code: 'informational', text: 'No threats found' },
  THREATS_FOUND: { severity: 'error', code: 'security', text: 'Threats found' },
  UNSUPPORTED: { severity: 'warning', code: 'not-supported', text: 'Object not supported for malware scanning' },
};

/**
 * Handles a Binary $scan request.
 *
 * Returns the GuardDuty Malware Protection result for the Binary content if there is one;
 * otherwise requests an on-demand scan. Scans are asynchronous: call again to read the result.
 * @param req - The FHIR request.
 * @returns The FHIR response.
 */
export async function binaryScanHandler(req: FhirRequest): Promise<FhirResponse> {
  const { repo } = getAuthenticatedContext();
  const binary = await repo.readResource<Binary>('Binary', req.params.id);

  const storage = getBinaryStorage();
  if (!(storage instanceof S3Storage)) {
    return [badRequest('Malware scanning requires S3 storage')];
  }
  if (getConfig().sseCustomerKey) {
    return [badRequest('Malware scanning is not supported with SSE-C encryption')];
  }

  const key = storage.getKey(binary);
  let status: string | undefined;
  try {
    status = (await storage.getObjectTags(key))[MALWARE_SCAN_STATUS_TAG];
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return [badRequest('Binary has no content to scan')];
    }
    throw err;
  }

  const result = status ? FINAL_RESULTS[status] : undefined;
  if (status && result) {
    return [allOk, buildOutputParameters(operation, scanOutcome(status, result))];
  }

  const client = new GuardDutyClient({ region: getConfig().awsRegion });
  await client.send(new SendObjectMalwareScanCommand({ S3Object: { Bucket: storage.bucket, Key: key } }));

  const requested: ScanResult = {
    severity: 'information',
    code: 'informational',
    text: status ? `Malware scan requested (previous result: ${status})` : 'Malware scan requested',
  };
  return [allOk, buildOutputParameters(operation, scanOutcome(SCAN_REQUESTED, requested))];
}

function scanOutcome(status: string, { severity, code, text }: ScanResult): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, details: { coding: [{ system: MALWARE_SCAN_STATUS_SYSTEM, code: status }], text } }],
  };
}
