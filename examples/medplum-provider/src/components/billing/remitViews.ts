// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Filter } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { PaymentReconciliation, PaymentReconciliationDetail } from '@medplum/fhirtypes';

/** A remittance view in the sidebar: a fixed set of filters on PaymentReconciliation. */
export interface RemitView {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly group?: 'By Status';
  readonly filters: Filter[];
}

const NOT_VOIDED: Filter = { code: 'status', operator: Operator.EQUALS, value: 'active' };

export const REMIT_VIEWS: RemitView[] = [
  { id: 'all', label: 'All Remittances', color: 'dark', filters: [] },
  {
    id: 'posted',
    label: 'Posted',
    group: 'By Status',
    color: 'green',
    filters: [NOT_VOIDED, { code: 'outcome', operator: Operator.EQUALS, value: 'complete,queued' }],
  },
  {
    id: 'partial',
    label: 'Partially Posted',
    group: 'By Status',
    color: 'orange',
    filters: [NOT_VOIDED, { code: 'outcome', operator: Operator.EQUALS, value: 'partial' }],
  },
  {
    id: 'error',
    label: 'Posting Error',
    group: 'By Status',
    color: 'red',
    filters: [NOT_VOIDED, { code: 'outcome', operator: Operator.EQUALS, value: 'error' }],
  },
  {
    id: 'voided',
    label: 'Voided',
    group: 'By Status',
    color: 'gray',
    filters: [{ code: 'status', operator: Operator.EQUALS, value: 'cancelled' }],
  },
];

export const REMIT_FIELDS = ['paymentDate', 'paymentIssuer', 'paymentIdentifier', 'paymentAmount'];

export function getRemitView(id: string | undefined): RemitView {
  return REMIT_VIEWS.find((v) => v.id === id?.toLowerCase()) ?? REMIT_VIEWS[0];
}

/**
 * A remittance's posting status: whether every payment line landed on a claim.
 * @param remit - The remittance.
 * @returns The status label and Mantine color.
 */
export function getRemitStatus(remit: PaymentReconciliation): { label: string; color: string } {
  if (remit.status === 'cancelled') {
    return { label: 'Voided', color: 'gray' };
  }
  switch (remit.outcome) {
    case 'queued':
      return { label: 'Posting…', color: 'blue' };
    case 'partial':
      return { label: 'Partially posted', color: 'orange' };
    case 'error':
      return { label: 'Posting error', color: 'red' };
    default:
      return { label: 'Posted', color: 'green' };
  }
}

/**
 * Whether a payment line didn't match a claim, e.g. an unknown patient or a provider-level adjustment.
 * @param detail - The payment line.
 * @returns True when the line has no claim.
 */
export function isUnmatched(detail: PaymentReconciliationDetail): boolean {
  return !detail.request?.reference;
}
