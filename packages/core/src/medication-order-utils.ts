// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Medication, MedicationRequest, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { getIdentifier } from './utils';

/** Re-export common coding systems used with medication-order drug search. */
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
 * Vendor-neutral input for an order-medication bot (matches the ScriptSure bot shape).
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
  readonly appId?: string;
}

/**
 * Vendor-neutral output from an order-medication bot.
 */
export interface MedicationOrderResponse {
  readonly orderId: number;
  /**
   * Vendor-side patient id (numeric in ScriptSure today; other vendors may use a different
   * shape). Kept as `number` for backwards compatibility with the ScriptSure bot output.
   */
  readonly vendorPatientId: number;
  readonly launchUrl: string;
  readonly medicationRequestId?: string;
  readonly pendingOrderStatus?: 'queued' | 'reused';
}

/**
 * Parameters for a drug search bot used by {@link MedicationOrderRequest} flows.
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
 * Vendor-neutral mapping of the extension URLs / identifier systems used to read
 * pending medication-order state stamped on a `MedicationRequest`.
 */
export interface MedicationOrderExtensions {
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
    typeof obj.vendorPatientId === 'number' &&
    Number.isFinite(obj.vendorPatientId) &&
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
 * Reads the pending medication-order id from MedicationRequest identifiers.
 * @param medicationRequest - Draft or active MR carrying vendor identifiers.
 * @param ext - Vendor extension URL and identifier system configuration.
 * @returns The pending order id string, if present.
 */
export function getPendingMedicationOrderId(
  medicationRequest: MedicationRequest,
  ext: MedicationOrderExtensions
): string | undefined {
  return getIdentifier(medicationRequest, ext.pendingOrderIdSystem);
}

/**
 * Reads the pending medication-order status code from MedicationRequest extensions.
 * @param medicationRequest - MR to read.
 * @param ext - Vendor extension URL configuration.
 * @returns The status code (e.g. queued), if present.
 */
export function getPendingMedicationOrderStatus(
  medicationRequest: MedicationRequest,
  ext: MedicationOrderExtensions
): string | undefined {
  const e = medicationRequest.extension?.find((x) => x.url === ext.pendingOrderStatusUrl);
  return e?.valueCode;
}

/**
 * Reads the medication-order iframe launch URL from MedicationRequest extensions.
 * @param medicationRequest - MR to read.
 * @param ext - Vendor extension URL configuration.
 * @returns The launch URL, if present.
 */
export function getMedicationOrderIframeUrl(
  medicationRequest: MedicationRequest,
  ext: MedicationOrderExtensions
): string | undefined {
  const e = medicationRequest.extension?.find((x) => x.url === ext.iframeUrlExtension);
  return e?.valueUrl;
}

// ============================================================================
// Custom FHIR operation ↔ Parameters serialization
//
// The vendor-neutral drug-search / order-medication custom FHIR operations
// (e.g. POST /fhir/R4/MedicationRequest/$order-medication) accept a `Parameters`
// resource on the wire. These helpers convert between the runtime TS shapes
// and that envelope so `useMedicationOrder` doesn't need to know the encoding
// rules.
// ============================================================================

/**
 * Builds a typed `ParametersParameter` entry. Use only when `value` is defined;
 * `undefined` should be filtered out upstream so optional fields don't leak as
 * empty `valueXxx` keys.
 *
 * @param name - Parameter name (matches `OperationDefinition.parameter[].name`).
 * @param key - The `valueXxx` key (e.g. `valueString`, `valueInteger`).
 * @param value - The runtime JS value to place under `valueXxx`.
 * @returns A `ParametersParameter` ready to push into `Parameters.parameter`.
 */
function param(name: string, key: string, value: unknown): ParametersParameter {
  return { name, [key]: value };
}

/**
 * Returns the inner `valueXxx` (or `resource`, or parsed `part`) for a single
 * `ParametersParameter` entry. Matches the unwrap rules used by the server's
 * `buildOutputParameters` round-trip and by the bot-side `parseInput` helper.
 *
 * @param p - The parameter entry to read.
 * @returns The unwrapped JS value, or `undefined` when none is present.
 */
function readParameterValue(p: ParametersParameter): unknown {
  if (p.resource !== undefined) {
    return p.resource;
  }
  if (p.part?.length) {
    return p.part;
  }
  for (const key of Object.keys(p)) {
    if (key.startsWith('value')) {
      return (p as unknown as Record<string, unknown>)[key];
    }
  }
  return undefined;
}

/**
 * Encodes a {@link MedicationSearchParams} as a FHIR `Parameters` body for the
 * vendor-neutral `$drug-search` (and `$drug-quantity-qualifiers`) custom
 * operations. Optional fields are omitted entirely so the wire payload stays
 * minimal and mirrors the legacy `executeBot` plain-JSON shape that the bot's
 * `parseInput` helper would otherwise have to coerce.
 *
 * @param params - Drug search parameters (vendor-neutral subset).
 * @returns A `Parameters` resource ready to POST.
 */
export function medicationSearchParamsToParameters(params: MedicationSearchParams): Parameters {
  const parameter: ParametersParameter[] = [];
  if (params.term !== undefined) {
    parameter.push(param('term', 'valueString', params.term));
  }
  if (params.ndc !== undefined) {
    parameter.push(param('ndc', 'valueString', params.ndc));
  }
  if (params.rxNorm !== undefined) {
    parameter.push(param('rxNorm', 'valueString', params.rxNorm));
  }
  if (params.routedMedId !== undefined) {
    parameter.push(param('routedMedId', 'valueInteger', params.routedMedId));
  }
  if (params.searchOtc !== undefined) {
    parameter.push(param('searchOtc', 'valueBoolean', params.searchOtc));
  }
  if (params.searchSupply !== undefined) {
    parameter.push(param('searchSupply', 'valueBoolean', params.searchSupply));
  }
  if (params.searchBrand !== undefined) {
    parameter.push(param('searchBrand', 'valueBoolean', params.searchBrand));
  }
  if (params.searchGeneric !== undefined) {
    parameter.push(param('searchGeneric', 'valueBoolean', params.searchGeneric));
  }
  if (params.includeCode !== undefined) {
    parameter.push(param('includeCode', 'valueBoolean', params.includeCode));
  }
  if (params.quantityQualifiers !== undefined) {
    parameter.push(param('quantityQualifiers', 'valueBoolean', params.quantityQualifiers));
  }
  return { resourceType: 'Parameters', parameter };
}

/**
 * Encodes a single {@link MedicationOrderDrugInput} as a `ParametersParameter`
 * (named entry containing nested `part:` for the drug fields). Used by
 * {@link medicationOrderRequestToParameters}; each drug line becomes a
 * separate top-level `drugs` entry so the OperationDefinition's
 * `max: '*'` cardinality serializes correctly.
 *
 * @param name - The outer parameter name (`drugs` for the primary list).
 * @param drug - A single drug line.
 * @returns A `ParametersParameter` with `part:` for each defined field.
 */
function drugLineToParameter(name: string, drug: MedicationOrderDrugInput): ParametersParameter {
  const part: ParametersParameter[] = [];
  if (drug.ndc !== undefined) {
    part.push(param('ndc', 'valueString', drug.ndc));
  }
  if (drug.rxNorm !== undefined) {
    part.push(param('rxNorm', 'valueString', drug.rxNorm));
  }
  if (drug.routedMedId !== undefined) {
    part.push(param('routedMedId', 'valueInteger', drug.routedMedId));
  }
  part.push(param('quantity', 'valueDecimal', drug.quantity));
  if (drug.quantityQualifier !== undefined) {
    part.push(param('quantityQualifier', 'valueString', drug.quantityQualifier));
  }
  if (drug.refill !== undefined) {
    part.push(param('refill', 'valueInteger', drug.refill));
  }
  if (drug.drugOrder !== undefined) {
    part.push(param('drugOrder', 'valueInteger', drug.drugOrder));
  }
  if (drug.sigLine3 !== undefined) {
    part.push(param('sigLine3', 'valueString', drug.sigLine3));
  }
  if (drug.useSubstitution !== undefined) {
    part.push(param('useSubstitution', 'valueBoolean', drug.useSubstitution));
  }
  return { name, part };
}

/**
 * Encodes a {@link MedicationOrderRequest} as a FHIR `Parameters` body for the
 * vendor-neutral `$order-medication` custom operation.
 *
 * Nested arrays (`drugs`, `compoundSigs`, `diagnoses`) are emitted as one
 * `parameter` entry per element so the OperationDefinition's `max: '*'`
 * cardinality round-trips; primitive arrays (`conditionIds`) likewise emit
 * one entry per id. Optional fields are omitted entirely.
 *
 * @param req - The order-medication request (vendor-neutral).
 * @returns A `Parameters` resource ready to POST.
 */
export function medicationOrderRequestToParameters(req: MedicationOrderRequest): Parameters {
  const parameter: ParametersParameter[] = [];

  parameter.push(param('patientId', 'valueId', req.patientId));
  if (req.medicationRequestId !== undefined) {
    parameter.push(param('medicationRequestId', 'valueId', req.medicationRequestId));
  }
  if (req.combinationMed !== undefined) {
    parameter.push(param('combinationMed', 'valueBoolean', req.combinationMed));
  }
  if (req.drugs) {
    for (const d of req.drugs) {
      parameter.push(drugLineToParameter('drugs', d));
    }
  }
  if (req.compoundTitle !== undefined) {
    parameter.push(param('compoundTitle', 'valueString', req.compoundTitle));
  }
  if (req.compoundQuantity !== undefined) {
    parameter.push(param('compoundQuantity', 'valueDecimal', req.compoundQuantity));
  }
  if (req.compoundQuantityQualifier !== undefined) {
    parameter.push(param('compoundQuantityQualifier', 'valueString', req.compoundQuantityQualifier));
  }
  if (req.compoundSigs) {
    for (const sig of req.compoundSigs) {
      const part: ParametersParameter[] = [
        param('sigOrder', 'valueInteger', sig.sigOrder),
        param('line3', 'valueString', sig.line3),
      ];
      if (sig.drugId !== undefined) {
        part.push(param('drugId', 'valueInteger', sig.drugId));
      }
      parameter.push({ name: 'compoundSigs', part });
    }
  }
  if (req.conditionIds) {
    for (const id of req.conditionIds) {
      parameter.push(param('conditionIds', 'valueId', id));
    }
  }
  if (req.coverageId !== undefined) {
    parameter.push(param('coverageId', 'valueId', req.coverageId));
  }
  if (req.payerOrganizationId !== undefined) {
    parameter.push(param('payerOrganizationId', 'valueId', req.payerOrganizationId));
  }
  if (req.pharmacyOrganizationId !== undefined) {
    parameter.push(param('pharmacyOrganizationId', 'valueId', req.pharmacyOrganizationId));
  }
  if (req.diagnoses) {
    for (const dx of req.diagnoses) {
      parameter.push({
        name: 'diagnoses',
        part: [param('icdId', 'valueString', dx.icdId), param('name', 'valueString', dx.name)],
      });
    }
  }
  if (req.pharmacyNcpdpId !== undefined) {
    parameter.push(param('pharmacyNcpdpId', 'valueString', req.pharmacyNcpdpId));
  }
  if (req.pharmacyName !== undefined) {
    parameter.push(param('pharmacyName', 'valueString', req.pharmacyName));
  }
  if (req.writtenDate !== undefined) {
    parameter.push(param('writtenDate', 'valueDate', req.writtenDate));
  }
  if (req.fillDate !== undefined) {
    parameter.push(param('fillDate', 'valueDate', req.fillDate));
  }
  if (req.durationDays !== undefined) {
    parameter.push(param('durationDays', 'valueInteger', req.durationDays));
  }
  if (req.pharmacyNote !== undefined) {
    parameter.push(param('pharmacyNote', 'valueString', req.pharmacyNote));
  }
  if (req.patientInstruction !== undefined) {
    parameter.push(param('patientInstruction', 'valueString', req.patientInstruction));
  }
  if (req.appId !== undefined) {
    parameter.push(param('appId', 'valueString', req.appId));
  }

  return { resourceType: 'Parameters', parameter };
}

/**
 * Decodes the `Parameters` response from the `$order-medication` custom
 * operation into a typed {@link MedicationOrderResponse}. Throws
 * `INVALID_MEDICATION_ORDER_RESPONSE` when required fields are missing.
 *
 * @param params - The `Parameters` resource returned by the operation.
 * @returns A vendor-neutral {@link MedicationOrderResponse}.
 */
export function parametersToMedicationOrderResponse(params: Parameters): MedicationOrderResponse {
  const map: Record<string, unknown> = {};
  for (const p of params.parameter ?? []) {
    if (p.name) {
      map[p.name] = readParameterValue(p);
    }
  }
  const candidate = {
    orderId: typeof map.orderId === 'number' ? map.orderId : Number.NaN,
    vendorPatientId: typeof map.vendorPatientId === 'number' ? map.vendorPatientId : Number.NaN,
    launchUrl: typeof map.launchUrl === 'string' ? map.launchUrl : '',
    medicationRequestId: typeof map.medicationRequestId === 'string' ? map.medicationRequestId : undefined,
    pendingOrderStatus:
      map.pendingOrderStatus === 'queued' || map.pendingOrderStatus === 'reused'
        ? map.pendingOrderStatus
        : undefined,
  };
  if (!isMedicationOrderResponse(candidate)) {
    throw new Error(INVALID_MEDICATION_ORDER_RESPONSE);
  }
  return candidate;
}
