// SPDX-License-Identifier: Apache-2.0
//
// Shared constants for the MedsScript platform billing / metering bots.
//
// These identifier + extension systems mirror the "billing plan" data model that
// is seeded as FHIR `Basic` resources (see README). Keeping them in one place so
// the metering bot and the invoicing bot agree on how to read plans and tag charges.

/** Identifier system that marks a `Basic` resource as a billing plan. */
export const BILLING_PLAN_IDENTIFIER_SYSTEM = 'https://medsscript.com/billing-plan';

/** Extension URLs used on the billing-plan `Basic` resource. */
export const PLAN_NAME_EXTENSION = 'https://medsscript.com/plan-name';
export const MONTHLY_FEE_EXTENSION = 'https://medsscript.com/monthly-fee-usd';
export const PER_TRANSACTION_FEE_EXTENSION = 'https://medsscript.com/per-transaction-fee-usd';

/**
 * ASSUMPTION (clinic -> plan mapping): a clinic `Organization` is linked to its
 * billing plan by carrying an identifier with THIS system whose `value` equals the
 * plan's identifier value. In other words, both the plan `Basic` and the clinic
 * `Organization` share `identifier.system = BILLING_PLAN_IDENTIFIER_SYSTEM` and the
 * same `identifier.value`. The user should confirm this is how clinics are wired to
 * plans (the alternative would be an explicit reference extension on the Organization).
 */
export const CLINIC_PLAN_IDENTIFIER_SYSTEM = BILLING_PLAN_IDENTIFIER_SYSTEM;

/** Code system describing the metered transaction type on a ChargeItem. */
export const TRANSACTION_TYPE_SYSTEM = 'https://medsscript.com/transaction-type';

/** Identifier system used to tag a ChargeItem so it is queryable per clinic + type + month. */
export const CHARGE_ITEM_IDENTIFIER_SYSTEM = 'https://medsscript.com/charge-item';

/** Tag system (Coding in meta.tag) carrying the billing period (YYYY-MM) for fast month queries. */
export const BILLING_PERIOD_TAG_SYSTEM = 'https://medsscript.com/billing-period';

/** Identifier system used to tag generated monthly Invoices (queryable per clinic + month). */
export const INVOICE_IDENTIFIER_SYSTEM = 'https://medsscript.com/monthly-invoice';

/** Billable transaction types recognised by the platform. */
export type TransactionType = 'rx' | 'diagnostic' | 'marketplace';

/**
 * ASSUMPTION (default fee): if a clinic's plan (or its per-transaction fee) cannot be
 * resolved, we still meter the transaction using this default so no billable event is
 * silently dropped. The user should confirm the default value / whether unresolved
 * plans should instead hard-fail.
 */
export const DEFAULT_PER_TRANSACTION_FEE_USD = 2.0;

/** Currency used for all Money amounts produced by these bots. */
export const CURRENCY = 'USD' as const;

/** Returns the billing period string (YYYY-MM) for a given date. */
export function getBillingPeriod(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}
