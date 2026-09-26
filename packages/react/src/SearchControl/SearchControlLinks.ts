// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Reference, Resource } from '@medplum/fhirtypes';
import { createContext, useContext } from 'react';

/** The link functions a SearchControl passes to its cells and right-click menu. */
export interface SearchControlLinks {
  readonly getResourceHref?: (resource: Resource) => string | undefined;
  readonly getReferenceHref?: (reference: Reference) => string | undefined;
}

/** Supplies the SearchControl's link functions to its cells. */
export const SearchControlLinksContext = createContext<SearchControlLinks>({});

/**
 * Returns the in-app link for a row's resource: the SearchControl's `getResourceHref` when set,
 * else `/${resourceType}/${id}`.
 * @param links - The SearchControl's link functions.
 * @param resource - The row's resource.
 * @returns The href, or undefined for no link.
 */
export function getResourceHref(links: SearchControlLinks, resource: Resource): string | undefined {
  return links.getResourceHref ? links.getResourceHref(resource) : `/${resource.resourceType}/${resource.id}`;
}

/**
 * Returns the in-app link for a reference: the SearchControl's `getReferenceHref` when set, else
 * `/${reference}`.
 * @param links - The SearchControl's link functions.
 * @param reference - The reference.
 * @returns The href, or undefined for no link.
 */
export function getReferenceHref(links: SearchControlLinks, reference: Reference): string | undefined {
  if (links.getReferenceHref) {
    return links.getReferenceHref(reference);
  }
  return reference.reference ? `/${reference.reference}` : undefined;
}

/**
 * Returns the link functions of the enclosing SearchControl.
 * @returns The link functions.
 */
export function useSearchControlLinks(): SearchControlLinks {
  return useContext(SearchControlLinksContext);
}
