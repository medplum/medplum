// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/*
 * A minimal client for Sandata's alternate EVV REST API.
 *
 * Each record type (employees, clients, visits) has its own intake endpoint. Sending is two steps:
 *   1. POST a JSON array of 1 to 5,000 records. Sandata acknowledges receipt and returns a transaction UUID.
 *   2. GET {endpoint}/status?uuid=... until processing finishes, then read which records were rejected.
 * Both steps return HTTP 200 even when records fail; the outcome is in the response body.
 */

export type SandataRecordType = 'employees' | 'clients' | 'visits';

export interface SandataCredentials {
  /** For example https://uat-api.sandata.com/interfaces/intake for testing. */
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
  /** The agency's Sandata account number, sent in the Account header. */
  readonly account: string;
}

export interface SandataResult {
  /** The transaction UUID, to look the transaction up with Sandata support. */
  readonly uuid: string;
  /** False if Sandata was still processing after the last status check. */
  readonly complete: boolean;
  /** Errors for rejected records, as "code: message". */
  readonly errors: string[];
}

interface SandataResponse {
  id?: string;
  status?: 'SUCCESS' | 'FAILED';
  messageSummary?: string | null;
  messageDetail?: string | null;
  /** An acknowledgement, or the submitted records annotated with ErrorCode and ErrorMessage. */
  data?: unknown;
}

/**
 * Sends records to Sandata and checks the status until processing finishes.
 * @param credentials - The agency's Sandata credentials.
 * @param type - The record type.
 * @param records - The records.
 * @param statusChecks - How many times to check the status before giving up.
 * @param delayMs - How long to wait before each status check.
 * @returns The result.
 */
export async function sendRecords(
  credentials: SandataCredentials,
  type: SandataRecordType,
  records: object[],
  statusChecks: number,
  delayMs: number
): Promise<SandataResult> {
  const url = `${credentials.baseUrl}/${type}/rest/api/v1.1`;
  let response = await request(credentials, url, { method: 'POST', body: JSON.stringify(records) });
  const uuid = response.id;
  if (!uuid) {
    throw new Error(`Sandata ${type} request failed: ${response.messageDetail ?? response.messageSummary}`);
  }

  // The POST response itself is final when validation fails; otherwise it says the result is "not ready yet"
  for (let check = 0; response.messageSummary?.includes('not ready yet'); check++) {
    if (check === statusChecks) {
      return { uuid, complete: false, errors: [] };
    }
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    response = await request(credentials, `${url}/status?uuid=${encodeURIComponent(uuid)}`, { method: 'GET' });
  }
  return { uuid, complete: true, errors: getErrors(response) };
}

async function request(credentials: SandataCredentials, url: string, init: RequestInit): Promise<SandataResponse> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
      Account: credentials.account,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Sandata returned HTTP ${response.status} for ${init.method} ${url}`);
  }
  return (await response.json()) as SandataResponse;
}

/**
 * Collects the errors from a finished transaction. Sandata returns rejected records with ErrorCode and ErrorMessage
 * fields, on the record or on one of its segments.
 * @param response - The final POST or status response.
 * @returns The errors, as "code: message".
 */
function getErrors(response: SandataResponse): string[] {
  const errors: string[] = [];
  const collect = (value: unknown): void => {
    if (value && typeof value === 'object') {
      const { ErrorCode, ErrorMessage } = value as Record<string, unknown>;
      if (typeof ErrorMessage === 'string' && ErrorMessage) {
        errors.push(typeof ErrorCode === 'string' ? `${ErrorCode}: ${ErrorMessage}` : ErrorMessage);
      }
      Object.values(value).forEach(collect);
    }
  };
  collect(response.data);
  if (errors.length === 0 && response.status === 'FAILED') {
    errors.push(response.messageDetail ?? response.messageSummary ?? 'Sandata reported a failure');
  }
  return errors;
}
