// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Medication, MedicationRequest, Parameters } from '@medplum/fhirtypes';
import type { MedicationOrderRequest, MedicationOrderResponse, MedicationSearchParams } from './medication-order-utils';
import {
  INVALID_MEDICATION_ORDER_RESPONSE,
  getMedicationOrderIframeUrl,
  getPendingMedicationOrderId,
  getPendingMedicationOrderStatus,
  isMedicationArray,
  isMedicationOrderResponse,
  medicationOrderRequestToParameters,
  medicationSearchParamsToParameters,
  parametersToMedicationOrderResponse,
} from './medication-order-utils';

const TEST_EXT = {
  pendingOrderIdSystem: 'https://example.com/pending-order-id',
  pendingOrderStatusUrl: 'https://example.com/pending-order-status',
  iframeUrlExtension: 'https://example.com/iframe-url',
} as const;

describe('isMedicationOrderResponse', () => {
  test('accepts valid response', () => {
    expect(
      isMedicationOrderResponse({
        orderId: 1,
        vendorPatientId: 2,
        launchUrl: 'https://example.com/widget',
      })
    ).toBe(true);
  });

  test('rejects missing fields', () => {
    expect(isMedicationOrderResponse({})).toBe(false);
    expect(isMedicationOrderResponse(null)).toBe(false);
    expect(
      isMedicationOrderResponse({
        orderId: 1,
        vendorPatientId: 2,
      })
    ).toBe(false);
  });
});

describe('isMedicationArray', () => {
  test('accepts empty array', () => {
    expect(isMedicationArray([])).toBe(true);
  });

  test('accepts Medication resources', () => {
    const meds: Medication[] = [{ resourceType: 'Medication', id: '1' }];
    expect(isMedicationArray(meds)).toBe(true);
  });

  test('rejects non-array', () => {
    expect(isMedicationArray({})).toBe(false);
  });
});

describe('MedicationOrder getters', () => {
  test('getPendingMedicationOrderId', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      identifier: [{ system: TEST_EXT.pendingOrderIdSystem, value: '99' }],
    } satisfies MedicationRequest;
    expect(getPendingMedicationOrderId(mr, TEST_EXT)).toBe('99');
  });

  test('getPendingMedicationOrderStatus', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      extension: [{ url: TEST_EXT.pendingOrderStatusUrl, valueCode: 'queued' }],
    } satisfies MedicationRequest;
    expect(getPendingMedicationOrderStatus(mr, TEST_EXT)).toBe('queued');
  });

  test('getMedicationOrderIframeUrl', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      extension: [{ url: TEST_EXT.iframeUrlExtension, valueUrl: 'https://iframe.example/' }],
    } satisfies MedicationRequest;
    expect(getMedicationOrderIframeUrl(mr, TEST_EXT)).toBe('https://iframe.example/');
  });
});

describe('Custom FHIR operation Parameters helpers', () => {
  test('medicationSearchParamsToParameters omits undefined fields', () => {
    const params: MedicationSearchParams = { term: 'aspirin', searchBrand: false };
    const result = medicationSearchParamsToParameters(params);
    expect(result.resourceType).toBe('Parameters');
    expect(result.parameter).toEqual([
      { name: 'term', valueString: 'aspirin' },
      { name: 'searchBrand', valueBoolean: false },
    ]);
  });

  test('medicationSearchParamsToParameters supports quantityQualifiers flag', () => {
    const result = medicationSearchParamsToParameters({ quantityQualifiers: true });
    expect(result.parameter).toEqual([{ name: 'quantityQualifiers', valueBoolean: true }]);
  });

  test('medicationOrderRequestToParameters emits one drugs entry per line', () => {
    const req: MedicationOrderRequest = {
      patientId: 'pat-1',
      combinationMed: true,
      compoundTitle: 'Test compound',
      drugs: [
        { ndc: '00310075190', quantity: 30, sigLine3: 'Sig A', refill: 1 },
        { rxNorm: '859747', quantity: 10, sigLine3: 'Sig B' },
      ],
      conditionIds: ['cond-1', 'cond-2'],
      diagnoses: [{ icdId: 'E78.5', name: 'Hyperlipidemia' }],
    };
    const result = medicationOrderRequestToParameters(req);
    expect(result.resourceType).toBe('Parameters');
    const drugs = result.parameter?.filter((p) => p.name === 'drugs');
    expect(drugs).toHaveLength(2);
    expect(drugs?.[0].part).toContainEqual({ name: 'ndc', valueString: '00310075190' });
    expect(drugs?.[0].part).toContainEqual({ name: 'quantity', valueDecimal: 30 });
    expect(drugs?.[0].part).toContainEqual({ name: 'refill', valueInteger: 1 });
    expect(drugs?.[1].part).toContainEqual({ name: 'rxNorm', valueString: '859747' });

    const conditionIds = result.parameter?.filter((p) => p.name === 'conditionIds');
    expect(conditionIds).toEqual([
      { name: 'conditionIds', valueId: 'cond-1' },
      { name: 'conditionIds', valueId: 'cond-2' },
    ]);

    expect(result.parameter).toContainEqual({ name: 'patientId', valueId: 'pat-1' });
    expect(result.parameter).toContainEqual({ name: 'combinationMed', valueBoolean: true });
    expect(result.parameter).toContainEqual({ name: 'compoundTitle', valueString: 'Test compound' });
  });

  test('parametersToMedicationOrderResponse round-trips the order response shape', () => {
    const expected: MedicationOrderResponse = {
      orderId: 1822,
      vendorPatientId: 24057,
      launchUrl: 'https://ui.example.com/widgets/prescription/24057/1822?sessiontoken=tok',
      medicationRequestId: 'mr-1',
      pendingOrderStatus: 'queued',
    };
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'orderId', valueInteger: 1822 },
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'launchUrl', valueUri: 'https://ui.example.com/widgets/prescription/24057/1822?sessiontoken=tok' },
        { name: 'medicationRequestId', valueId: 'mr-1' },
        { name: 'pendingOrderStatus', valueCode: 'queued' },
      ],
    };
    expect(parametersToMedicationOrderResponse(params)).toEqual(expected);
  });

  test('parametersToMedicationOrderResponse rejects malformed Parameters', () => {
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'orderId', valueInteger: 1 }],
    };
    expect(() => parametersToMedicationOrderResponse(params)).toThrow(INVALID_MEDICATION_ORDER_RESPONSE);
  });

  test('parametersToMedicationOrderResponse ignores unknown pendingOrderStatus codes', () => {
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'orderId', valueInteger: 1 },
        { name: 'vendorPatientId', valueInteger: 2 },
        { name: 'launchUrl', valueUri: 'https://example.com/widget' },
        { name: 'pendingOrderStatus', valueCode: 'something-else' },
      ],
    };
    const result = parametersToMedicationOrderResponse(params);
    expect(result.pendingOrderStatus).toBeUndefined();
  });
});
