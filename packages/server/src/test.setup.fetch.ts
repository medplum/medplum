// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType } from '@medplum/core';
import type { Mock } from 'vitest';

export type MockFetchInit = {
  status?: number;
  contentType?: string;
};

/**
 * Returns a mock fetch Response with a JSON body.
 * @param body - The JSON-serializable response body.
 * @param init - Optional status and content type.
 * @returns A promise that resolves to a Response.
 */
export function mockFetchJson(body: unknown, init?: MockFetchInit): Promise<Response> {
  const status = init?.status ?? 200;
  const contentType = init?.contentType ?? ContentType.JSON;
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': contentType },
    })
  );
}

/**
 * Returns a mock fetch Response with the given HTTP status and no body.
 * @param status - The HTTP status code.
 * @returns A promise that resolves to a Response.
 */
export function mockFetchStatus(status: number): Promise<Response> {
  return Promise.resolve(new Response(null, { status }));
}

/**
 * Returns a mock fetch Response with a text body.
 * @param body - The response body text.
 * @param init - Optional status and content type.
 * @returns A promise that resolves to a Response.
 */
export function mockFetchText(body: string, init?: MockFetchInit): Promise<Response> {
  const status = init?.status ?? 200;
  const headers: Record<string, string> = {};
  if (init?.contentType) {
    headers['Content-Type'] = init.contentType;
  }
  return Promise.resolve(new Response(body, { status, headers }));
}

/**
 * Sets up the fetch mock to handle Recaptcha requests.
 * @param success - Whether the mock should return a successful response.
 */
export function setupRecaptchaMock(success: boolean): void {
  (globalThis.fetch as Mock).mockImplementation(() => mockFetchJson({ success }));
}
