// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcome, Resource } from '@medplum/fhirtypes';
import type { MedplumClientOptions } from './client';
import { MedplumClient } from './client';
import { ContentType } from './contenttype';
import { badRequest, notFound } from './outcomes';
import { ClientStorage, MemoryStorage } from './storage';

/**
 * Creates a MedplumClient that serves reads from the given resources and never touches the network.
 *
 * Use it to render Medplum React components from data gathered up front:
 *
 * ```tsx
 * const medplum = createStaticClient([report, patient, ...observations]);
 * <MedplumProvider medplum={medplum}>
 *   <DiagnosticReportDisplay value={report} />
 * </MedplumProvider>
 * ```
 *
 * Only reads by type and id (`GET [base]/Type/id`) are supported. A read of a resource not in the
 * list fails with "Not found", the same as a real server. Any other request, such as a search or a
 * write, fails with "Bad request".
 * @param resources - The resources to serve.
 * @param options - Optional client options. `fetch` and `storage` are always replaced.
 * @returns The client.
 */
export function createStaticClient(resources: Resource[], options?: MedplumClientOptions): MedplumClient {
  const byKey = new Map<string, Resource>();
  for (const resource of resources) {
    if (resource.id) {
      byKey.set(`${resource.resourceType}/${resource.id}`, resource);
    }
  }

  // Assigned below; the fetch closure only runs after construction.
  let fhirBaseUrl = '';

  const client = new MedplumClient({
    ...options,
    storage: new ClientStorage(new MemoryStorage()),
    fetch: async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.startsWith(fhirBaseUrl) ? url.slice(fhirBaseUrl.length).replace(/^\//, '') : undefined;
      if (method !== 'GET' || !path || !/^[A-Za-z]+\/[^/?]+$/.test(path)) {
        return jsonResponse(400, badRequest(`Not supported by static client: ${method} ${url}`));
      }
      const resource = byKey.get(path);
      return resource ? jsonResponse(200, resource) : jsonResponse(404, notFound);
    },
  });

  fhirBaseUrl = client.fhirUrl().toString();
  return client;
}

function jsonResponse(status: number, body: Resource | OperationOutcome): Partial<Response> {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ 'content-type': ContentType.FHIR_JSON }),
    json: async () => body,
  };
}
