// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Medication, MedicationRequest, Parameters } from '@medplum/fhirtypes';
import type {
  MedicationOrderRequest,
  MedicationOrderResponse,
  MedicationOrderSetRequest,
  MedicationOrderSetResponse,
  MedicationSearchParams,
} from './medication-order-utils';
import {
  INVALID_MEDICATION_ORDER_RESPONSE,
  INVALID_MEDICATION_ORDER_SET_RESPONSE,
  getMedicationOrderIframeUrl,
  getPendingMedicationOrderId,
  getPendingMedicationOrderStatus,
  isMedicationArray,
  isMedicationOrderResponse,
  isMedicationOrderSetResponse,
  medicationOrderRequestToParameters,
  medicationOrderSetRequestToParameters,
  medicationSearchParamsToParameters,
  parametersToMedicationOrderResponse,
  parametersToMedicationOrderSetResponse,
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

  test('rejects non-Medication entries', () => {
    expect(isMedicationArray([{ resourceType: 'Patient', id: '1' }])).toBe(false);
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

  test('getPendingMedicationOrderId returns undefined when identifier is absent', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
    } satisfies MedicationRequest;
    expect(getPendingMedicationOrderId(mr, TEST_EXT)).toBeUndefined();
  });

  test('getPendingMedicationOrderStatus returns undefined when extension is absent', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
    } satisfies MedicationRequest;
    expect(getPendingMedicationOrderStatus(mr, TEST_EXT)).toBeUndefined();
  });

  test('getMedicationOrderIframeUrl returns undefined when extension is absent', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
    } satisfies MedicationRequest;
    expect(getMedicationOrderIframeUrl(mr, TEST_EXT)).toBeUndefined();
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

  test('medicationSearchParamsToParameters encodes all optional search fields', () => {
    const result = medicationSearchParamsToParameters({
      term: 'lipitor',
      ndc: '00310075190',
      rxNorm: '859747',
      routedMedId: 6876,
      searchOtc: true,
      searchSupply: false,
      searchBrand: true,
      searchGeneric: false,
      includeCode: true,
    });
    expect(result.parameter).toEqual([
      { name: 'term', valueString: 'lipitor' },
      { name: 'ndc', valueString: '00310075190' },
      { name: 'rxNorm', valueString: '859747' },
      { name: 'routedMedId', valueInteger: 6876 },
      { name: 'searchOtc', valueBoolean: true },
      { name: 'searchSupply', valueBoolean: false },
      { name: 'searchBrand', valueBoolean: true },
      { name: 'searchGeneric', valueBoolean: false },
      { name: 'includeCode', valueBoolean: true },
    ]);
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

  test('medicationOrderRequestToParameters encodes optional order fields and drug line details', () => {
    const req: MedicationOrderRequest = {
      patientId: 'pat-1',
      medicationRequestId: 'mr-1',
      drugs: [
        {
          ndc: '00310075190',
          rxNorm: '859747',
          routedMedId: 6876,
          quantity: 30,
          quantityQualifier: 'C48542',
          refill: 2,
          drugOrder: 1,
          sigLine3: 'Take daily',
          useSubstitution: true,
        },
      ],
      compoundSigs: [{ sigOrder: 1, line3: 'Swish', drugId: 42 }],
      coverageId: 'cov-1',
      payerOrganizationId: 'org-payer',
      pharmacyOrganizationId: 'org-pharm',
      pharmacyNcpdpId: '1234567',
      pharmacyName: 'CVS',
      writtenDate: '2026-05-18',
      fillDate: '2026-05-19',
      durationDays: 30,
      pharmacyNote: 'Call patient first',
      patientInstruction: 'With food',
      appId: 'provider-app',
    };
    const result = medicationOrderRequestToParameters(req);
    expect(result.parameter).toContainEqual({ name: 'medicationRequestId', valueId: 'mr-1' });
    expect(result.parameter).toContainEqual({ name: 'coverageId', valueId: 'cov-1' });
    expect(result.parameter).toContainEqual({ name: 'payerOrganizationId', valueId: 'org-payer' });
    expect(result.parameter).toContainEqual({ name: 'pharmacyOrganizationId', valueId: 'org-pharm' });
    expect(result.parameter).toContainEqual({ name: 'pharmacyNcpdpId', valueString: '1234567' });
    expect(result.parameter).toContainEqual({ name: 'pharmacyName', valueString: 'CVS' });
    expect(result.parameter).toContainEqual({ name: 'writtenDate', valueDate: '2026-05-18' });
    expect(result.parameter).toContainEqual({ name: 'fillDate', valueDate: '2026-05-19' });
    expect(result.parameter).toContainEqual({ name: 'durationDays', valueInteger: 30 });
    expect(result.parameter).toContainEqual({ name: 'pharmacyNote', valueString: 'Call patient first' });
    expect(result.parameter).toContainEqual({ name: 'patientInstruction', valueString: 'With food' });
    expect(result.parameter).toContainEqual({ name: 'appId', valueString: 'provider-app' });

    const drugs = result.parameter?.find((p) => p.name === 'drugs');
    expect(drugs?.part).toContainEqual({ name: 'routedMedId', valueInteger: 6876 });
    expect(drugs?.part).toContainEqual({ name: 'quantityQualifier', valueString: 'C48542' });
    expect(drugs?.part).toContainEqual({ name: 'drugOrder', valueInteger: 1 });
    expect(drugs?.part).toContainEqual({ name: 'useSubstitution', valueBoolean: true });

    const compoundSig = result.parameter?.find((p) => p.name === 'compoundSigs');
    expect(compoundSig?.part).toContainEqual({ name: 'drugId', valueInteger: 42 });
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

  test('parametersToMedicationOrderResponse accepts reused pendingOrderStatus', () => {
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'orderId', valueInteger: 1 },
        { name: 'vendorPatientId', valueInteger: 2 },
        { name: 'launchUrl', valueUri: 'https://example.com/widget' },
        { name: 'pendingOrderStatus', valueCode: 'reused' },
      ],
    };
    expect(parametersToMedicationOrderResponse(params).pendingOrderStatus).toBe('reused');
  });

  describe('isMedicationOrderSetResponse', () => {
    test('accepts valid response with only launchUrl', () => {
      expect(isMedicationOrderSetResponse({ launchUrl: 'https://example.com/widget' })).toBe(true);
    });

    test('rejects missing or empty launchUrl', () => {
      expect(isMedicationOrderSetResponse({})).toBe(false);
      expect(isMedicationOrderSetResponse(null)).toBe(false);
      expect(isMedicationOrderSetResponse({ launchUrl: '' })).toBe(false);
    });
  });

  test('medicationOrderSetRequestToParameters encodes planDefinitionId branch', () => {
    const req: MedicationOrderSetRequest = {
      patientId: 'pat-1',
      planDefinitionId: 'pd-1',
      appId: 'provider-app',
    };
    const result = medicationOrderSetRequestToParameters(req);
    expect(result.resourceType).toBe('Parameters');
    expect(result.parameter).toEqual([
      { name: 'patientId', valueId: 'pat-1' },
      { name: 'planDefinitionId', valueId: 'pd-1' },
      { name: 'appId', valueString: 'provider-app' },
    ]);
  });

  test('medicationOrderSetRequestToParameters encodes numeric vendorOrderSetId as valueInteger', () => {
    const result = medicationOrderSetRequestToParameters({
      patientId: 'pat-1',
      vendorOrderSetId: 377,
    });
    expect(result.parameter).toEqual([
      { name: 'patientId', valueId: 'pat-1' },
      { name: 'vendorOrderSetId', valueInteger: 377 },
    ]);
  });

  test('medicationOrderSetRequestToParameters encodes string vendorOrderSetId as valueString', () => {
    const result = medicationOrderSetRequestToParameters({
      patientId: 'pat-1',
      vendorOrderSetId: 'os-377-alpha',
    });
    expect(result.parameter).toContainEqual({ name: 'vendorOrderSetId', valueString: 'os-377-alpha' });
  });

  test('parametersToMedicationOrderSetResponse round-trips the order-set response shape', () => {
    const expected: MedicationOrderSetResponse = {
      launchUrl: 'https://ui.example.com/widgets/prescription/order-set/24057/377?sessiontoken=tok',
      vendorPatientId: 24057,
      vendorOrderSetId: 377,
      planDefinitionId: 'pd-1',
    };
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        {
          name: 'launchUrl',
          valueUri: 'https://ui.example.com/widgets/prescription/order-set/24057/377?sessiontoken=tok',
        },
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'vendorOrderSetId', valueInteger: 377 },
        { name: 'planDefinitionId', valueId: 'pd-1' },
      ],
    };
    expect(parametersToMedicationOrderSetResponse(params)).toEqual(expected);
  });

  test('parametersToMedicationOrderSetResponse tolerates missing optional echoes', () => {
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'launchUrl', valueUri: 'https://example.com/widget' }],
    };
    expect(parametersToMedicationOrderSetResponse(params)).toEqual({
      launchUrl: 'https://example.com/widget',
      vendorPatientId: undefined,
      vendorOrderSetId: undefined,
      planDefinitionId: undefined,
    });
  });

  test('parametersToMedicationOrderSetResponse rejects missing launchUrl', () => {
    const params: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'vendorPatientId', valueInteger: 1 }],
    };
    expect(() => parametersToMedicationOrderSetResponse(params)).toThrow(INVALID_MEDICATION_ORDER_SET_RESPONSE);
  });
});
