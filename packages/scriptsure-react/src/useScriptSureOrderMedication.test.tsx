// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Medication, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { useScriptSureOrderMedication } from './useScriptSureOrderMedication';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureOrderMedication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('forwards drug search to $drug-search FHIR operation', async () => {
    const medplum = new MockClient();
    const bundle: Bundle<Medication> = {
      resourceType: 'Bundle',
      type: 'searchset',
      total: 1,
      entry: [{ resource: { resourceType: 'Medication', id: 'm1' } }],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(bundle);

    const { result } = renderHook(() => useScriptSureOrderMedication(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current.searchMedications({ term: 'lipitor' });
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain('Medication/$drug-search');
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [{ name: 'term', valueString: 'lipitor' }],
    });
  });

  test('forwards order to $order-medication FHIR operation', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'orderId', valueInteger: 1 },
        { name: 'vendorPatientId', valueInteger: 2 },
        { name: 'launchUrl', valueUri: 'https://iframe.example/' },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useScriptSureOrderMedication(), { wrapper: wrapper(medplum) });

    await act(async () => {
      await result.current.orderMedication({ patientId: 'p1', medicationRequestId: 'mr1' });
    });

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain('MedicationRequest/$order-medication');
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'medicationRequestId', valueId: 'mr1' },
      ],
    });
  });
});
