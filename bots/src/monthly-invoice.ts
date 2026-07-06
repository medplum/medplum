// SPDX-License-Identifier: Apache-2.0
//
// monthly-invoice.ts
//
// Intended to run on a schedule (cron Subscription) once per billing period.
// For every clinic Organization it:
//   1. sums the current month's ChargeItems for that clinic (the per-transaction usage),
//   2. adds the clinic's monthly subscription fee (from its billing plan),
//   3. creates a FHIR Invoice (status 'issued') with one line item per fee component and a
//      totalGross covering usage + subscription.
//
// The invoice is tagged with an identifier so re-runs are idempotent per clinic + month.
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Basic,
  ChargeItem,
  Extension,
  Invoice,
  InvoiceLineItem,
  Organization,
} from '@medplum/fhirtypes';
import {
  BILLING_PLAN_IDENTIFIER_SYSTEM,
  BILLING_PERIOD_TAG_SYSTEM,
  CLINIC_PLAN_IDENTIFIER_SYSTEM,
  CURRENCY,
  INVOICE_IDENTIFIER_SYSTEM,
  MONTHLY_FEE_EXTENSION,
  TRANSACTION_TYPE_SYSTEM,
  getBillingPeriod,
} from './constants';

export async function handler(medplum: MedplumClient, event: BotEvent): Promise<Invoice[]> {
  // Determine the billing period to invoice.
  //
  // WHERE THE RUN-PERIOD COMES FROM: when invoked on a schedule, Medplum passes no meaningful
  // input, so we default to the current month (the period that just closed, if you cron this on
  // the 1st). To back-fill a specific month, the bot can be triggered with an input object
  // carrying { billingPeriod: 'YYYY-MM' }; we honour that when present.
  const requestedPeriod = extractRequestedPeriod(event);
  const billingPeriod = requestedPeriod ?? getBillingPeriod(new Date());
  console.log(`Generating monthly invoices for billing period ${billingPeriod}`);

  // Iterate every clinic Organization.
  const clinics = await medplum.searchResources('Organization', { _count: '1000' });
  const invoices: Invoice[] = [];

  for (const clinic of clinics) {
    if (!clinic.id) {
      continue;
    }

    const invoice = await createInvoiceForClinic(medplum, clinic, billingPeriod);
    if (invoice) {
      invoices.push(invoice);
    }
  }

  console.log(`Generated ${invoices.length} invoice(s) for ${billingPeriod}`);
  return invoices;
}

async function createInvoiceForClinic(
  medplum: MedplumClient,
  clinic: Organization,
  billingPeriod: string
): Promise<Invoice | undefined> {
  // 1. Sum this period's ChargeItems for this clinic.
  //    Query by performing-organization + the billing-period meta.tag.
  const chargeItems = await medplum.searchResources('ChargeItem', {
    'performing-organization': `Organization/${clinic.id}`,
    _tag: `${BILLING_PERIOD_TAG_SYSTEM}|${billingPeriod}`,
    _count: '1000',
  });

  // Group usage by transaction type so each type becomes its own invoice line item.
  const usageByType = new Map<string, { count: number; amount: number }>();
  for (const item of chargeItems) {
    const type = getTransactionType(item) ?? 'unknown';
    const amount = item.priceOverride?.value ?? 0;
    const bucket = usageByType.get(type) ?? { count: 0, amount: 0 };
    bucket.count += 1;
    bucket.amount += amount;
    usageByType.set(type, bucket);
  }

  // 2. Resolve the clinic's monthly subscription fee from its billing plan.
  const monthlyFee = await resolveMonthlyFee(medplum, clinic);

  // If there is no usage and no subscription fee, skip this clinic entirely.
  const usageTotal = [...usageByType.values()].reduce((sum, b) => sum + b.amount, 0);
  if (chargeItems.length === 0 && monthlyFee <= 0) {
    return undefined;
  }

  // 3. Build line items: one per usage type, plus the subscription fee.
  const lineItems: InvoiceLineItem[] = [];
  let sequence = 1;

  for (const [type, bucket] of usageByType) {
    lineItems.push({
      sequence: sequence++,
      chargeItemCodeableConcept: {
        coding: [{ system: TRANSACTION_TYPE_SYSTEM, code: type }],
        text: `${type} transactions (x${bucket.count})`,
      },
      priceComponent: [
        {
          type: 'base',
          code: {
            coding: [{ system: TRANSACTION_TYPE_SYSTEM, code: type }],
            text: `Usage: ${type} (${bucket.count} @ transaction fee)`,
          },
          amount: { value: round2(bucket.amount), currency: CURRENCY },
        },
      ],
    });
  }

  if (monthlyFee > 0) {
    lineItems.push({
      sequence: sequence++,
      chargeItemCodeableConcept: {
        coding: [{ system: TRANSACTION_TYPE_SYSTEM, code: 'subscription' }],
        text: 'Monthly subscription fee',
      },
      priceComponent: [
        {
          type: 'base',
          code: {
            coding: [{ system: TRANSACTION_TYPE_SYSTEM, code: 'subscription' }],
            text: 'Monthly subscription fee',
          },
          amount: { value: round2(monthlyFee), currency: CURRENCY },
        },
      ],
    });
  }

  const totalGross = round2(usageTotal + monthlyFee);

  const invoiceIdentifierValue = `${clinic.id}|${billingPeriod}`;
  const invoice: Invoice = {
    resourceType: 'Invoice',
    status: 'issued',
    identifier: [{ system: INVOICE_IDENTIFIER_SYSTEM, value: invoiceIdentifierValue }],
    meta: { tag: [{ system: BILLING_PERIOD_TAG_SYSTEM, code: billingPeriod }] },
    recipient: createReference(clinic),
    date: new Date().toISOString(),
    lineItem: lineItems,
    totalGross: { value: totalGross, currency: CURRENCY },
  };

  // Idempotent per clinic + month: don't create a duplicate if one already exists.
  const created = await medplum.createResourceIfNoneExist(
    invoice,
    `identifier=${INVOICE_IDENTIFIER_SYSTEM}|${invoiceIdentifierValue}`
  );

  console.log(
    `Invoice/${created.id} for clinic ${clinic.id} (${billingPeriod}): ${chargeItems.length} charge(s), total ${totalGross} ${CURRENCY}`
  );
  return created;
}

/**
 * Resolve the clinic's monthly subscription fee from its billing plan.
 * Same clinic -> plan mapping assumption as meter-transaction.ts: the clinic Organization
 * carries an identifier (system CLINIC_PLAN_IDENTIFIER_SYSTEM) whose value matches the plan
 * `Basic`'s identifier value. Returns 0 if the plan / fee cannot be resolved.
 */
async function resolveMonthlyFee(medplum: MedplumClient, clinic: Organization): Promise<number> {
  const planIdentifierValue = clinic.identifier?.find(
    (id) => id.system === CLINIC_PLAN_IDENTIFIER_SYSTEM
  )?.value;
  if (!planIdentifierValue) {
    return 0;
  }

  const plan = await medplum.searchOne('Basic', {
    identifier: `${BILLING_PLAN_IDENTIFIER_SYSTEM}|${planIdentifierValue}`,
  });
  if (!plan) {
    return 0;
  }
  return getDecimalExtension(plan, MONTHLY_FEE_EXTENSION) ?? 0;
}

/** Reads the transaction-type code off a ChargeItem's code.coding. */
function getTransactionType(item: ChargeItem): string | undefined {
  return item.code?.coding?.find((c) => c.system === TRANSACTION_TYPE_SYSTEM)?.code;
}

/** Reads a valueDecimal extension off a Basic (billing plan) resource. */
function getDecimalExtension(resource: Basic, url: string): number | undefined {
  const ext = resource.extension?.find((e: Extension) => e.url === url);
  return ext?.valueDecimal;
}

/**
 * If the bot is invoked with an input object carrying a billingPeriod, honour it.
 * Otherwise return undefined and the caller defaults to the current month.
 */
function extractRequestedPeriod(event: BotEvent): string | undefined {
  const input = event.input as unknown;
  if (input && typeof input === 'object' && 'billingPeriod' in input) {
    const value = (input as { billingPeriod?: unknown }).billingPeriod;
    if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
      return value;
    }
  }
  return undefined;
}

/** Round to 2 decimal places to keep Money amounts clean. */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
