// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { ClientStorage, ContentType, MemoryStorage } from '@medplum/core';
import type { Bundle } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';

const FHIR_PREFIX = 'fhir/R4/';

/**
 * Creates a MockClient that serves reads from an in-memory overlay, seeded with a demo report for
 * the patient, and forwards everything else to the real client's server.
 * @param real - The authenticated client.
 * @param patientId - The patient the demo report belongs to.
 * @returns The proxy client.
 */
export async function createLabsProxyClient(real: MedplumClient, patientId: string): Promise<MockClient> {
  const baseUrl = real.getBaseUrl();
  const overlay = new MockClient({ baseUrl, seedDefaultData: false, storage: new ClientStorage(new MemoryStorage()) });
  const subject = { reference: `Patient/${patientId}` };
  await overlay.updateResource({
    resourceType: 'Observation',
    id: `proxy-demo-hba1c-${patientId}`,
    status: 'final',
    code: { text: 'Hemoglobin A1c' },
    subject,
    valueQuantity: { value: 5.4, unit: '%' },
    referenceRange: [{ high: { value: 5.6, unit: '%' } }],
  });
  await overlay.updateResource({
    resourceType: 'DiagnosticReport',
    id: `proxy-demo-report-${patientId}`,
    status: 'final',
    code: { text: 'Hemoglobin A1c (in-memory demo)' },
    subject,
    result: [{ reference: `Observation/proxy-demo-hba1c-${patientId}` }],
    effectiveDateTime: '2026-11-05T08:00:00Z',
    issued: '2026-11-06T09:00:00Z',
  });

  const forward = (url: string, options: RequestInit): Promise<Response> => {
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${real.getAccessToken()}`);
    return fetch(url, { ...options, headers });
  };

  const proxyFetch = async (url: string, options: RequestInit = {}): Promise<Partial<Response>> => {
    const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
    if ((options.method ?? 'GET') !== 'GET' || !path.startsWith(FHIR_PREFIX)) {
      return forward(url, options);
    }
    const segments = path.slice(FHIR_PREFIX.length).split('?')[0].split('/');
    if (segments.length > 2 || segments.some((s) => s.includes('$'))) {
      return forward(url, options);
    }
    const local = await overlay.client.mockFetch(url, options);
    if (segments.length === 2) {
      return local.status === 200 ? local : forward(url, options);
    }
    const localBundle = local.status === 200 ? ((await local.json?.()) as Bundle) : undefined;
    if (!localBundle?.entry?.length) {
      return forward(url, options);
    }
    const remote = await forward(url, options);
    if (!remote.ok) {
      return remote;
    }
    const remoteBundle = (await remote.json()) as Bundle;
    const merged: Bundle = {
      ...remoteBundle,
      total: (remoteBundle.total ?? 0) + localBundle.entry.length,
      entry: [...localBundle.entry, ...(remoteBundle.entry ?? [])],
    };
    return new Response(JSON.stringify(merged), { status: 200, headers: { 'content-type': ContentType.FHIR_JSON } });
  };

  return new MockClient({
    baseUrl,
    storage: new ClientStorage(new MemoryStorage()),
    fetch: proxyFetch,
    profile: real.getProfile(),
    project: real.getProject(),
    mockFetchOverride: { router: overlay.router, repo: overlay.repo, client: overlay.client },
  });
}
