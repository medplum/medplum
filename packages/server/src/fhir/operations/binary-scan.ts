// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { GuardDutyClient, SendObjectMalwareScanCommand } from '@aws-sdk/client-guardduty';
import { NoSuchKey } from '@aws-sdk/client-s3';
import { accepted, allOk, badRequest, concatUrls, normalizeErrorString, sleep } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, OperationOutcome, OperationOutcomeIssue } from '@medplum/fhirtypes';
import { S3Storage } from '../../cloud/aws/storage';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getLogger } from '../../logger';
import { getBinaryStorage } from '../../storage/loader';
import { makeOperationDefinition } from './definitions';
import { AsyncJobExecutor } from './utils/asyncjobexecutor';
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

/** Object tag holding the time $scan last requested a scan. */
export const MALWARE_SCAN_REQUESTED_TAG = 'MedplumMalwareScanRequested';

/** How long a requested scan with no result counts as in progress before $scan requests another. */
export const MALWARE_SCAN_PENDING_MS = 60 * 60 * 1000;

export const MALWARE_SCAN_STATUS_SYSTEM = 'https://medplum.com/fhir/CodeSystem/malware-scan-status';

/** Our code for "scan submitted, result pending"; every other code is a GuardDuty tag value. */
export const SCAN_REQUESTED = 'SCAN_REQUESTED';

/** How often and how long $scan polls for the GuardDuty result before reporting the scan as in progress. */
export const scanWait = { pollMs: 2_000, syncTimeoutMs: 30_000, asyncTimeoutMs: 15 * 60_000 };

type ScanResult = Pick<OperationOutcomeIssue, 'severity' | 'code'> & { text: string };

/**
 * Results a re-scan would not change; GuardDuty bills every on-demand scan without deduping.
 * `FAILED` and `ACCESS_DENIED` can be transient, so those are re-sent.
 */
const FINAL_RESULTS: Record<string, ScanResult> = {
  NO_THREATS_FOUND: { severity: 'information', code: 'informational', text: 'No threats found' },
  THREATS_FOUND: { severity: 'error', code: 'security', text: 'Threats found' },
  UNSUPPORTED: { severity: 'warning', code: 'not-supported', text: 'Object not supported for malware scanning' },
};

const RETRYABLE_RESULTS: Record<string, ScanResult> = {
  FAILED: { severity: 'error', code: 'exception', text: 'Malware scan failed' },
  ACCESS_DENIED: { severity: 'error', code: 'forbidden', text: 'GuardDuty could not read the object' },
};

/**
 * Handles a Binary $scan request.
 *
 * Returns the GuardDuty Malware Protection result for the Binary content, requesting an on-demand scan and waiting
 * for its result if there isn't one yet. With `Prefer: respond-async`, the wait runs as an AsyncJob instead.
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
  let tags: Record<string, string>;
  try {
    tags = await storage.getObjectTags(key);
  } catch (err) {
    if (err instanceof NoSuchKey) {
      return [badRequest('Binary has no content to scan')];
    }
    throw err;
  }

  if (req.headers?.['prefer'] === 'respond-async') {
    const { baseUrl } = getConfig();
    const exec = new AsyncJobExecutor(repo);
    await exec.init(concatUrls(baseUrl, 'fhir/R4' + req.pathname));
    exec.start(async () => {
      const outcome = await scanAndWait(storage, key, tags, scanWait.asyncTimeoutMs);
      return { resourceType: 'Parameters', parameter: [{ name: 'return', resource: outcome }] };
    });
    return [accepted(exec.getContentLocation(baseUrl))];
  }

  const outcome = await scanAndWait(storage, key, tags, scanWait.syncTimeoutMs);
  return [allOk, buildOutputParameters(operation, outcome)];
}

async function scanAndWait(
  storage: S3Storage,
  key: string,
  tags: Record<string, string>,
  timeoutMs: number
): Promise<OperationOutcome> {
  const status = tags[MALWARE_SCAN_STATUS_TAG];
  if (status && FINAL_RESULTS[status]) {
    return scanOutcome(status, FINAL_RESULTS[status]);
  }

  // Requesting a scan drops any old status tag, so a status next to the marker means that scan finished
  const requestedAt = tags[MALWARE_SCAN_REQUESTED_TAG];
  if (status || !requestedAt || Date.now() - Date.parse(requestedAt) >= MALWARE_SCAN_PENDING_MS) {
    await requestScan(storage, key, tags);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(scanWait.pollMs);
    const result = (await storage.getObjectTags(key))[MALWARE_SCAN_STATUS_TAG];
    if (result) {
      const known = FINAL_RESULTS[result] ?? RETRYABLE_RESULTS[result];
      return scanOutcome(result, known ?? { severity: 'error', code: 'exception', text: `Malware scan ${result}` });
    }
  }

  const pending: ScanResult = {
    severity: 'information',
    code: 'informational',
    text: 'Malware scan in progress, call $scan again for the result',
  };
  return scanOutcome(SCAN_REQUESTED, pending);
}

async function requestScan(storage: S3Storage, key: string, tags: Record<string, string>): Promise<void> {
  // PutObjectTagging replaces the whole set and only GuardDuty may write the status tag, so the stale
  // status is dropped. Write before sending: a write after could erase a result GuardDuty already tagged.
  const otherTags = Object.fromEntries(
    Object.entries(tags).filter(([k]) => k !== MALWARE_SCAN_STATUS_TAG && k !== MALWARE_SCAN_REQUESTED_TAG)
  );
  await storage.putObjectTags(key, { ...otherTags, [MALWARE_SCAN_REQUESTED_TAG]: new Date().toISOString() });

  try {
    const client = new GuardDutyClient({ region: getConfig().awsRegion });
    await client.send(new SendObjectMalwareScanCommand({ S3Object: { Bucket: storage.bucket, Key: key } }));
  } catch (err) {
    // Clear the marker so the next call retries instead of reporting a scan that was never sent
    await storage.putObjectTags(key, otherTags).catch((clearErr: unknown) => {
      getLogger().error('Failed to clear malware scan marker', { key, err: normalizeErrorString(clearErr) });
    });
    throw err;
  }
}

function scanOutcome(status: string, { severity, code, text }: ScanResult): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [{ severity, code, details: { coding: [{ system: MALWARE_SCAN_STATUS_SYSTEM, code: status }], text } }],
  };
}
