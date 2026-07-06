// SPDX-License-Identifier: Apache-2.0
//
// meter-transaction.ts
//
// Fired by a Medplum Subscription whenever a billable transaction resource is
// created. A billable "transaction" is:
//   - a prescription      -> MedicationRequest  -> type 'rx'
//   - a diagnostic/kit order -> ServiceRequest   -> type 'diagnostic'
// (Marketplace orders are metered by a sibling flow; the shared plumbing lives in
//  constants.ts and the ChargeItem shape below is identical for them.)
//
// For each such create it:
//   1. determines the transaction type,
//   2. resolves the patient's clinic Organization,
//   3. looks up that clinic's billing plan (per-transaction fee),
//   4. creates a FHIR ChargeItem (status 'billable') priced with that fee, tagged
//      so it is queryable per clinic + type + month.
import type { BotEvent, MedplumClient } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  Basic,
  ChargeItem,
  Extension,
  MedicationRequest,
  Organization,
  Patient,
  Reference,
  ServiceRequest,
} from '@medplum/fhirtypes';
import {
  BILLING_PLAN_IDENTIFIER_SYSTEM,
  BILLING_PERIOD_TAG_SYSTEM,
  CHARGE_ITEM_IDENTIFIER_SYSTEM,
  CLINIC_PLAN_IDENTIFIER_SYSTEM,
  CURRENCY,
  DEFAULT_PER_TRANSACTION_FEE_USD,
  PER_TRANSACTION_FEE_EXTENSION,
  TRANSACTION_TYPE_SYSTEM,
  type TransactionType,
  getBillingPeriod,
} from './constants';

type BillableTransaction = MedicationRequest | ServiceRequest;

export async function handler(medplum: MedplumClient, event: BotEvent<BillableTransaction>): Promise<ChargeItem> {
  const resource = event.input;

  // 1. Determine the transaction type from the triggering resource.
  const transactionType: TransactionType =
    resource.resourceType === 'MedicationRequest' ? 'rx' : 'diagnostic';

  // 2. Resolve the patient, then the patient's clinic Organization.
  const patient = await resolvePatient(medplum, resource);
  const clinic = await resolveClinic(medplum, resource, patient);
  if (!clinic) {
    throw new Error(
      `Unable to resolve a clinic Organization for ${resource.resourceType}/${resource.id ?? '(no id)'}; cannot meter transaction.`
    );
  }

  // 3. Look up the clinic's billing plan and its per-transaction fee.
  const perTransactionFee = await resolvePerTransactionFee(medplum, clinic);

  // 4. Build + create the ChargeItem.
  //    occurrenceDateTime prefers the transaction's own date, falling back to now.
  const occurrence = getTransactionDate(resource) ?? new Date().toISOString();
  const billingPeriod = getBillingPeriod(new Date(occurrence));

  const chargeItem: ChargeItem = {
    resourceType: 'ChargeItem',
    status: 'billable',
    // Tag with a stable, queryable identifier: clinic + type + period + source resource.
    identifier: [
      {
        system: CHARGE_ITEM_IDENTIFIER_SYSTEM,
        value: `${clinic.id}|${transactionType}|${billingPeriod}|${resource.resourceType}/${resource.id ?? ''}`,
      },
    ],
    // meta.tag with the billing period gives us a fast "this month for this clinic" query.
    meta: {
      tag: [{ system: BILLING_PERIOD_TAG_SYSTEM, code: billingPeriod }],
    },
    code: {
      coding: [
        {
          system: TRANSACTION_TYPE_SYSTEM,
          code: transactionType,
          display: transactionTypeDisplay(transactionType),
        },
      ],
      text: transactionTypeDisplay(transactionType),
    },
    subject: createReference(patient),
    performingOrganization: createReference(clinic),
    occurrenceDateTime: occurrence,
    priceOverride: {
      value: perTransactionFee,
      currency: CURRENCY,
    },
    // Link back to the resource that generated this charge for auditability.
    supportingInformation: [createReference(resource)],
  };

  const created = await medplum.createResource(chargeItem);
  console.log(
    `Metered ${transactionType} transaction for clinic ${clinic.id}: ChargeItem/${created.id} @ ${perTransactionFee} ${CURRENCY}`
  );
  return created;
}

/**
 * Resolve the Patient behind a billable transaction.
 * MedicationRequest.subject and ServiceRequest.subject both point at the patient
 * (ServiceRequest.subject can technically be a Group/Location/Device, but for our
 * telehealth flows it is a Patient — we assume that and read it as such).
 */
async function resolvePatient(medplum: MedplumClient, resource: BillableTransaction): Promise<Patient> {
  const subjectRef = resource.subject as Reference<Patient> | undefined;
  if (!subjectRef?.reference) {
    throw new Error(`${resource.resourceType}/${resource.id ?? '(no id)'} has no subject; cannot resolve patient.`);
  }
  return medplum.readReference(subjectRef);
}

/**
 * Best-effort resolution of the clinic Organization for a transaction.
 *
 * ASSUMPTION (clinic derivation): the clinic is, in priority order:
 *   1. the requester/performer of the transaction, if that reference is an Organization; else
 *   2. the patient's `managingOrganization`.
 * The requester/performer on our transactions is usually a Practitioner (the prescriber),
 * so in practice #2 (patient.managingOrganization) is the reliable signal for "which clinic
 * does this patient belong to". The user should confirm patients are assigned a
 * managingOrganization at intake.
 */
async function resolveClinic(
  medplum: MedplumClient,
  resource: BillableTransaction,
  patient: Patient
): Promise<Organization | undefined> {
  // 1. Try requester (both resource types) or performer (ServiceRequest) if it is an Organization.
  const candidateRefs: (Reference | undefined)[] = [resource.requester];
  if (resource.resourceType === 'ServiceRequest') {
    candidateRefs.push(...(resource.performer ?? []));
  }
  for (const ref of candidateRefs) {
    if (ref?.reference?.startsWith('Organization/')) {
      return medplum.readReference(ref as Reference<Organization>);
    }
  }

  // 2. Fall back to the patient's managing organization.
  if (patient.managingOrganization?.reference) {
    return medplum.readReference(patient.managingOrganization);
  }

  return undefined;
}

/**
 * Look up the clinic's billing plan and return its per-transaction fee.
 *
 * ASSUMPTION (clinic -> plan mapping): the clinic Organization carries an identifier with
 * system CLINIC_PLAN_IDENTIFIER_SYSTEM whose value equals the plan `Basic`'s identifier value
 * (same system, same value). We find that identifier value on the clinic, then search for the
 * matching billing-plan `Basic`. If either cannot be resolved we fall back to
 * DEFAULT_PER_TRANSACTION_FEE_USD so the transaction is still metered.
 */
async function resolvePerTransactionFee(medplum: MedplumClient, clinic: Organization): Promise<number> {
  const planIdentifierValue = clinic.identifier?.find(
    (id) => id.system === CLINIC_PLAN_IDENTIFIER_SYSTEM
  )?.value;

  if (!planIdentifierValue) {
    console.warn(
      `Clinic ${clinic.id} has no billing-plan identifier; defaulting per-transaction fee to ${DEFAULT_PER_TRANSACTION_FEE_USD} ${CURRENCY}.`
    );
    return DEFAULT_PER_TRANSACTION_FEE_USD;
  }

  const plan = await medplum.searchOne('Basic', {
    identifier: `${BILLING_PLAN_IDENTIFIER_SYSTEM}|${planIdentifierValue}`,
  });

  const fee = plan ? getDecimalExtension(plan, PER_TRANSACTION_FEE_EXTENSION) : undefined;
  if (fee === undefined) {
    console.warn(
      `Could not resolve per-transaction fee for clinic ${clinic.id} (plan '${planIdentifierValue}'); defaulting to ${DEFAULT_PER_TRANSACTION_FEE_USD} ${CURRENCY}.`
    );
    return DEFAULT_PER_TRANSACTION_FEE_USD;
  }
  return fee;
}

/** Reads a valueDecimal extension off a Basic (billing plan) resource. */
function getDecimalExtension(resource: Basic, url: string): number | undefined {
  const ext = resource.extension?.find((e: Extension) => e.url === url);
  return ext?.valueDecimal;
}

/** Prefer the transaction's own timestamp; fall back to caller-supplied default. */
function getTransactionDate(resource: BillableTransaction): string | undefined {
  if (resource.resourceType === 'ServiceRequest') {
    return resource.occurrenceDateTime ?? resource.authoredOn;
  }
  return resource.authoredOn;
}

function transactionTypeDisplay(type: TransactionType): string {
  switch (type) {
    case 'rx':
      return 'Prescription (MedicationRequest)';
    case 'diagnostic':
      return 'Diagnostic / kit order (ServiceRequest)';
    case 'marketplace':
      return 'Marketplace order';
    default:
      return type;
  }
}
