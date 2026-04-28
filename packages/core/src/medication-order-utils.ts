// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Medication, MedicationRequest } from '@medplum/fhirtypes';
import { getIdentifier } from './utils';

/** Re-export common coding systems used with e-prescribing medication search. */
export { NDC, RXNORM } from './constants';

/**
 * Stable error when a bot response does not match {@link MedicationOrderResponse}.
 */
export const INVALID_MEDICATION_ORDER_RESPONSE = 'Invalid response from order medication bot';

/**
 * Stable error when a bot response is not a Medication array.
 */
export const INVALID_MEDICATION_SEARCH_RESPONSE = 'Invalid response from medication search bot';

/**
 * Vendor-neutral drug line for {@link MedicationOrderRequest}.
 */
export interface MedicationOrderDrugInput {
  readonly ndc?: string;
  readonly rxNorm?: string;
  readonly routedMedId?: number;
  readonly quantity: number;
  readonly quantityQualifier?: string;
  readonly refill?: number;
  readonly drugOrder?: number;
  readonly sigLine3?: string;
  readonly useSubstitution?: boolean;
}

/**
 * Vendor-neutral input for an e-prescribing order-medication bot (matches ScriptSure bot shape).
 */
export interface MedicationOrderRequest {
  readonly patientId: string;
  readonly medicationRequestId?: string;
  readonly combinationMed?: boolean;
  readonly drugs?: MedicationOrderDrugInput[];
  readonly compoundTitle?: string;
  readonly compoundQuantity?: number;
  readonly compoundQuantityQualifier?: string;
  readonly compoundSigs?: { readonly sigOrder: number; readonly line3: string; readonly drugId?: number }[];
  readonly conditionIds?: string[];
  readonly coverageId?: string;
  readonly payerOrganizationId?: string;
  readonly pharmacyOrganizationId?: string;
  readonly diagnoses?: { readonly icdId: string; readonly name: string }[];
  readonly pharmacyNcpdpId?: string;
  readonly pharmacyName?: string;
  readonly writtenDate?: string;
  readonly fillDate?: string;
  /** Days supply for ScriptSure pending order duration (used when no draft MR, e.g. compound). */
  readonly durationDays?: number;
  /** Notes to pharmacist (ScriptSure pending-order pharmacyNote); also stored on draft MR as `note`. */
  readonly pharmacyNote?: string;
  /** Free-text patient instructions (additional sig); maps to dosageInstruction[0].patientInstruction when using MR path. */
  readonly patientInstruction?: string;
  readonly darkmode?: 'on' | 'off';
  readonly appId?: string;
}

/**
 * Vendor-neutral output from an e-prescribing order-medication bot.
 */
export interface MedicationOrderResponse {
  readonly orderId: number;
  /** ScriptSure patient id; other vendors may use a different semantic — keep as number when possible. */
  readonly scriptSurePatientId: number;
  readonly launchUrl: string;
  readonly medicationRequestId?: string;
  readonly pendingOrderStatus?: 'queued' | 'reused';
}

/**
 * Parameters for an e-prescribing drug search bot.
 */
export interface MedicationSearchParams {
  readonly term?: string;
  readonly ndc?: string;
  readonly rxNorm?: string;
  readonly routedMedId?: number;
  readonly searchOtc?: boolean;
  readonly searchSupply?: boolean;
  readonly searchBrand?: boolean;
  readonly searchGeneric?: boolean;
  readonly includeCode?: boolean;
  /** When true, drug-search bot returns quantity qualifiers from GET /v3/prescription/quantityqualifier instead of Medication[]. */
  readonly quantityQualifiers?: boolean;
}

/**
 * Extension URLs / identifier systems used to read pending order state from a MedicationRequest.
 */
export interface EPrescribingExtensions {
  readonly pendingOrderIdSystem: string;
  readonly pendingOrderStatusUrl: string;
  readonly iframeUrlExtension: string;
}

/**
 * Type guard: validates an order-medication bot response.
 * @param value - Unknown bot JSON payload.
 * @returns True when the value matches MedicationOrderResponse.
 */
export function isMedicationOrderResponse(value: unknown): value is MedicationOrderResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.orderId === 'number' &&
    Number.isFinite(obj.orderId) &&
    typeof obj.scriptSurePatientId === 'number' &&
    Number.isFinite(obj.scriptSurePatientId) &&
    typeof obj.launchUrl === 'string' &&
    obj.launchUrl.length > 0
  );
}

/**
 * Type guard: validates an array of Medication resources (drug search bot output).
 * @param value - Unknown bot JSON payload.
 * @returns True when the value is a non-empty or empty array of Medication resources.
 */
export function isMedicationArray(value: unknown): value is Medication[] {
  if (!Array.isArray(value)) {
    return false;
  }
  if (value.length > 0) {
    const first = value[0];
    return typeof first === 'object' && first !== null && first.resourceType === 'Medication';
  }
  return true;
}

/**
 * Reads pending order id from MedicationRequest identifiers.
 * @param medicationRequest - Draft or active MR carrying vendor identifiers.
 * @param ext - Vendor extension URL and identifier system configuration.
 * @returns The pending order id string, if present.
 */
export function getEPrescribingPendingOrderId(
  medicationRequest: MedicationRequest,
  ext: EPrescribingExtensions
): string | undefined {
  return getIdentifier(medicationRequest, ext.pendingOrderIdSystem);
}

/**
 * Reads pending order status code from MedicationRequest extensions.
 * @param medicationRequest - MR to read.
 * @param ext - Vendor extension URL configuration.
 * @returns The status code (e.g. queued), if present.
 */
export function getEPrescribingPendingOrderStatus(
  medicationRequest: MedicationRequest,
  ext: EPrescribingExtensions
): string | undefined {
  const e = medicationRequest.extension?.find((x) => x.url === ext.pendingOrderStatusUrl);
  return e?.valueCode;
}

/**
 * Reads iframe launch URL from MedicationRequest extensions.
 * @param medicationRequest - MR to read.
 * @param ext - Vendor extension URL configuration.
 * @returns The launch URL, if present.
 */
export function getEPrescribingIframeUrl(
  medicationRequest: MedicationRequest,
  ext: EPrescribingExtensions
): string | undefined {
  const e = medicationRequest.extension?.find((x) => x.url === ext.iframeUrlExtension);
  return e?.valueUrl;
}
