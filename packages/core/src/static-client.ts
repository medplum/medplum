// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { OperationOutcome, Resource } from '@medplum/fhirtypes';
import type { MedplumClientOptions } from './client';
import { MedplumClient } from './client';
import { ContentType } from './contenttype';
import { badRequest, notFound } from './outcomes';
import { ClientStorage, MemoryStorage } from './storage';

/**
 * A FHIR read path relative to the FHIR base URL: `Patient/123`.
 * Does not match searches (`Patient?name=Homer`), sub-paths (`Patient/123/_history`), or operations (`$export`).
 */
const READ_PATH = /^(?<resourceType>[A-Za-z]+)\/(?<id>[^/?]+)$/;

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
 * @param options - Optional client options. `fetch`, `storage`, and `autoBatchTime` are always replaced.
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
    autoBatchTime: 0,
    storage: new ClientStorage(new MemoryStorage()),
    fetch: async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = url.startsWith(fhirBaseUrl) ? url.slice(fhirBaseUrl.length).replace(/^\//, '') : undefined;
      const read = method === 'GET' ? path?.match(READ_PATH)?.groups : undefined;
      if (!read) {
        return jsonResponse(400, badRequest(`Not supported by static client: ${method} ${url}`));
      }
      const resource = byKey.get(`${read.resourceType}/${read.id}`);
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
