// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Medication, MedicationRequest } from '@medplum/fhirtypes';
import {
  getEPrescribingIframeUrl,
  getEPrescribingPendingOrderId,
  getEPrescribingPendingOrderStatus,
  isMedicationArray,
  isMedicationOrderResponse,
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
        scriptSurePatientId: 2,
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
        scriptSurePatientId: 2,
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

describe('EPrescribing getters', () => {
  test('getEPrescribingPendingOrderId', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      identifier: [{ system: TEST_EXT.pendingOrderIdSystem, value: '99' }],
    } satisfies MedicationRequest;
    expect(getEPrescribingPendingOrderId(mr, TEST_EXT)).toBe('99');
  });

  test('getEPrescribingPendingOrderStatus', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      extension: [{ url: TEST_EXT.pendingOrderStatusUrl, valueCode: 'queued' }],
    } satisfies MedicationRequest;
    expect(getEPrescribingPendingOrderStatus(mr, TEST_EXT)).toBe('queued');
  });

  test('getEPrescribingIframeUrl', () => {
    const mr = {
      resourceType: 'MedicationRequest' as const,
      status: 'draft' as const,
      intent: 'order' as const,
      subject: { reference: 'Patient/1' },
      extension: [{ url: TEST_EXT.iframeUrlExtension, valueUrl: 'https://iframe.example/' }],
    } satisfies MedicationRequest;
    expect(getEPrescribingIframeUrl(mr, TEST_EXT)).toBe('https://iframe.example/');
  });
});
