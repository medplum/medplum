// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest, SortRule } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { LabTab } from '@medplum/react';

// The "Completed" tab lists finalized results; the "Open" tab lists orders that
// have not yet resolved into a result; the "Revoked" tab lists revoked orders.
export const LAB_REVOKED_ORDER_STATUS = 'revoked';
const COMPLETED_REPORT_STATUS = 'final,corrected,amended';
const OPEN_ORDER_STATUS = 'active,draft,on-hold';
const DEFAULT_SORT_RULES: SortRule[] = [{ code: '_lastUpdated', descending: true }];
const DEFAULT_COUNT = 20;

/**
 * Returns the resource type listed by a lab tab.
 * @param tab - The lab tab.
 * @returns DiagnosticReport for the completed tab, otherwise ServiceRequest.
 */
export function getLabResourceType(tab: LabTab): 'DiagnosticReport' | 'ServiceRequest' {
  return tab === 'completed' ? 'DiagnosticReport' : 'ServiceRequest';
}

/**
 * Applies the tab's default status filter and a default sort to a parsed search.
 * Anything already present in the search (status, sort, count) is preserved.
 * @param search - The search, typically parsed from the URL.
 * @param tab - The active tab, which determines the default status filter.
 * @returns The search with default lab values populated.
 */
export function addDefaultLabSearchValues(search: SearchRequest, tab: LabTab): SearchRequest {
  const filters = search.filters ?? [];
  const hasStatus = filters.some((filter) => filter.code === 'status');
  let defaultStatus: string;
  if (tab === 'completed') {
    defaultStatus = COMPLETED_REPORT_STATUS;
  } else if (tab === 'revoked') {
    defaultStatus = LAB_REVOKED_ORDER_STATUS;
  } else {
    defaultStatus = OPEN_ORDER_STATUS;
  }
  return {
    ...search,
    filters: hasStatus ? filters : [...filters, { code: 'status', operator: Operator.EQUALS, value: defaultStatus }],
    sortRules: search.sortRules ?? DEFAULT_SORT_RULES,
    count: search.count ?? DEFAULT_COUNT,
  };
}
