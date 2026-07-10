// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { INVALID_MEDICATION_CART_RESPONSE, INVALID_MEDICATION_CHECKOUT_RESPONSE } from '@medplum/core';
import type { WithId } from '@medplum/core';
import type { MedicationRequest, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import { MEDICATION_CART_ADD_IN_PROGRESS, useMedicationCart } from './useMedicationCart';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return (
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>
      </MemoryRouter>
    );
  };
}

const REMOVE_URL = 'fhir/R4/MedicationRequest/$remove-cart-medication';
const CLEAR_URL = 'fhir/R4/MedicationRequest/$clear-cart';
const CHECKOUT_URL = 'fhir/R4/MedicationRequest/$checkout-medications';

describe('useMedicationCart', () => {
  test('removeFromCart POSTs to $remove-cart-medication and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'removedCount', valueInteger: 1 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-1' },
            { name: 'vendorLineId', valueString: 'rx-1' },
            { name: 'status', valueCode: 'removed' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.removeFromCart({ patientId: 'p1', medicationRequestId: 'mr-1' });
    });

    expect(out).toEqual({
      vendorPatientId: 24057,
      removedCount: 1,
      items: [{ medicationRequestId: 'mr-1', vendorLineId: 'rx-1', status: 'removed' }],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(REMOVE_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'action', valueCode: 'remove' },
        { name: 'medicationRequestId', valueId: 'mr-1' },
      ],
    });
  });

  test('clearCart POSTs to $clear-cart and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'vendorPatientId', valueInteger: 24057 },
        { name: 'removedCount', valueInteger: 2 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-a' },
            { name: 'status', valueCode: 'removed' },
          ],
        },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-b' },
            { name: 'status', valueCode: 'failed' },
            { name: 'error', valueString: 'vendor 500' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.clearCart({ patientId: 'p1' });
    });

    expect(out).toEqual({
      vendorPatientId: 24057,
      removedCount: 2,
      items: [
        { medicationRequestId: 'mr-a', status: 'removed' },
        { medicationRequestId: 'mr-b', status: 'failed', error: 'vendor 500' },
      ],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(CLEAR_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'action', valueCode: 'clear' },
      ],
    });
  });

  test('removeFromCart throws when response is not a Parameters envelope', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ removedCount: 1 });

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    await expect(result.current.removeFromCart({ patientId: 'p1', medicationRequestId: 'mr-1' })).rejects.toThrow(
      INVALID_MEDICATION_CART_RESPONSE
    );
  });

  test('checkout POSTs to $checkout-medications and decodes the Parameters response', async () => {
    const medplum = new MockClient();
    const responseParams: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'approvalUrl', valueUri: 'https://example.com/widgets/medcart/24057?sessiontoken=tok' },
        { name: 'vendorPatientId', valueInteger: 24057 },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-1' },
            { name: 'vendorLineId', valueString: 'rx-1' },
            { name: 'status', valueCode: 'queued' },
          ],
        },
        {
          name: 'items',
          part: [
            { name: 'medicationRequestId', valueId: 'mr-2' },
            { name: 'status', valueCode: 'failed' },
            { name: 'error', valueString: 'no rxnorm' },
          ],
        },
      ],
    };
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValueOnce(responseParams);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    let out: unknown;
    await act(async () => {
      out = await result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1', 'mr-2'] });
    });

    expect(out).toEqual({
      approvalUrl: 'https://example.com/widgets/medcart/24057?sessiontoken=tok',
      vendorPatientId: 24057,
      items: [
        { medicationRequestId: 'mr-1', vendorLineId: 'rx-1', status: 'queued' },
        { medicationRequestId: 'mr-2', status: 'failed', error: 'no rxnorm' },
      ],
    });
    expect(postSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = postSpy.mock.calls[0];
    expect(calledUrl.toString()).toContain(CHECKOUT_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'medicationRequestIds', valueId: 'mr-1' },
        { name: 'medicationRequestIds', valueId: 'mr-2' },
      ],
    });
  });

  test('checkout throws when response is not a Parameters envelope', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce({ approvalUrl: 'only-url' });

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    await expect(result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1'] })).rejects.toThrow(
      INVALID_MEDICATION_CHECKOUT_RESPONSE
    );
  });

  test('checkout throws when Parameters payload is missing approvalUrl', async () => {
    const medplum = new MockClient();
    const malformed: Parameters = {
      resourceType: 'Parameters',
      parameter: [{ name: 'vendorPatientId', valueInteger: 1 }],
    };
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(malformed);

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    await expect(result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1'] })).rejects.toThrow(
      INVALID_MEDICATION_CHECKOUT_RESPONSE
    );
  });

  test('addToCart creates the MedicationRequest and tracks adding', async () => {
    const medplum = new MockClient();
    let resolveCreate: ((mr: WithId<MedicationRequest>) => void) | undefined;
    const createSpy = vi.spyOn(medplum, 'createResource').mockImplementation(
      () =>
        new Promise<WithId<MedicationRequest>>((resolve) => {
          resolveCreate = resolve;
        })
    );

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });
    expect(result.current.adding).toBe(false);

    const draft: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'draft',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
    };

    let createdPromise: Promise<MedicationRequest>;
    act(() => {
      createdPromise = result.current.addToCart(draft);
    });

    await waitFor(() => {
      expect(result.current.adding).toBe(true);
    });

    const created: WithId<MedicationRequest> = { ...draft, id: 'mr-new' };
    await act(async () => {
      resolveCreate?.(created);
      await createdPromise;
    });

    expect(createSpy).toHaveBeenCalledWith(draft);
    expect(result.current.adding).toBe(false);
  });

  test('checkout throws while addToCart is in flight', async () => {
    const medplum = new MockClient();
    let resolveCreate: ((mr: WithId<MedicationRequest>) => void) | undefined;
    vi.spyOn(medplum, 'createResource').mockImplementation(
      () =>
        new Promise<WithId<MedicationRequest>>((resolve) => {
          resolveCreate = resolve;
        })
    );
    const postSpy = vi.spyOn(medplum, 'post');

    const { result } = renderHook(() => useMedicationCart(), { wrapper: wrapper(medplum) });

    const draft: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'draft',
      intent: 'order',
      subject: { reference: 'Patient/p1' },
    };

    let addPromise: Promise<MedicationRequest>;
    act(() => {
      addPromise = result.current.addToCart(draft);
    });

    await waitFor(() => {
      expect(result.current.adding).toBe(true);
    });

    await expect(result.current.checkout({ patientId: 'p1', medicationRequestIds: ['mr-1'] })).rejects.toThrow(
      MEDICATION_CART_ADD_IN_PROGRESS
    );
    expect(postSpy).not.toHaveBeenCalled();

    await act(async () => {
      resolveCreate?.({ ...draft, id: 'mr-new' });
      await addPromise;
    });
  });
});
