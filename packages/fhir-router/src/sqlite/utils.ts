// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { formatSearchQuery } from '@medplum/core';
import type { SearchRequest } from '@medplum/core';

export function getFullUrl(resourceType: string, id: string): string;
export function getFullUrl(searchRequest: SearchRequest, offset: number): string;
export function getFullUrl(arg1: string | SearchRequest, arg2?: number | string): string {
  if (typeof arg1 === 'string' && typeof arg2 === 'string') {
    return `https://example.com/fhir/R4/${arg1}/${arg2}`;
  }
  const searchRequest = arg1 as SearchRequest;
  const offset = (arg2 as number) ?? 0;
  const params = new URLSearchParams();
  if (searchRequest.count !== undefined) {
    params.set('_count', String(searchRequest.count));
  }
  if (offset > 0) {
    params.set('_offset', String(offset));
  }
  const query = params.toString();
  return `https://example.com/fhir/R4/${searchRequest.resourceType}${formatSearchQuery(searchRequest)}${query ? '&' + query : ''}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export { clamp };
