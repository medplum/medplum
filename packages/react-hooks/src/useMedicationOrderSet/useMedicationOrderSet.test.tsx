// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { INVALID_MEDICATION_ORDER_SET_RESPONSE } from '@medplum/core';
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import type { UseMedicationOrderSetOptions } from './useMedicationOrderSet';
import { useMedicationOrderSet } from './useMedicationOrderSet';

const PATIENT_ID = 'patient-1';
const URL_A = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokA';
const URL_B = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokB';
const OPERATION_URL = 'fhir/R4/PlanDefinition/$order-set-url';

function paramsResponse(
  launchUrl: string,
  extras?: { vendorPatientId?: number; vendorOrderSetId?: number }
): Parameters {
  const parameter = [
    { name: 'launchUrl', valueUri: launchUrl },
    ...(extras?.vendorPatientId !== undefined
      ? [{ name: 'vendorPatientId', valueInteger: extras.vendorPatientId }]
      : []),
    ...(extras?.vendorOrderSetId !== undefined
      ? [{ name: 'vendorOrderSetId', valueInteger: extras.vendorOrderSetId }]
      : []),
  ];
  return { resourceType: 'Parameters', parameter };
}

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

function renderOrderSetHook(
  medplum: MockClient,
  options: UseMedicationOrderSetOptions
): ReturnType<typeof renderHook<ReturnType<typeof useMedicationOrderSet>, UseMedicationOrderSetOptions>> {
  return renderHook((opts: UseMedicationOrderSetOptions) => useMedicationOrderSet(opts), {
    wrapper: wrapper(medplum),
    initialProps: options,
  });
}

describe('useMedicationOrderSet', () => {
  test('happy path — POSTs to $order-set-url and exposes launchUrl', async () => {
    const medplum = new MockClient();
    const post = jest
      .spyOn(medplum, 'post')
      .mockResolvedValue(paramsResponse(URL_A, { vendorPatientId: 100, vendorOrderSetId: 377 }));

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(post).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = post.mock.calls[0];
    expect(calledUrl.toString()).toContain(OPERATION_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: PATIENT_ID },
        { name: 'vendorOrderSetId', valueInteger: 377 },
      ],
    });
    expect(result.current.url).toBe(URL_A);
    expect(result.current.error).toBeUndefined();
  });

  test('forwards planDefinitionId branch when no vendorOrderSetId is set', async () => {
    const medplum = new MockClient();
    const post = jest.spyOn(medplum, 'post').mockResolvedValue(paramsResponse(URL_A));

    renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      planDefinitionId: 'pd-1',
    });

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [, body] = post.mock.calls[0];
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: PATIENT_ID },
        { name: 'planDefinitionId', valueId: 'pd-1' },
      ],
    });
  });

  test('stays idle (no operation call, no URL) when patientId is undefined', async () => {
    const medplum = new MockClient();
    const post = jest.spyOn(medplum, 'post');

    const { result } = renderOrderSetHook(medplum, {
      patientId: undefined,
      vendorOrderSetId: 377,
    });

    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(post).not.toHaveBeenCalled();
  });

  test('stays idle when neither planDefinitionId nor vendorOrderSetId is set', async () => {
    const medplum = new MockClient();
    const post = jest.spyOn(medplum, 'post');

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
    });

    expect(result.current.url).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  test('clears URL and reruns when inputs change (abort-on-change semantics)', async () => {
    const medplum = new MockClient();
    const post = jest
      .spyOn(medplum, 'post')
      .mockResolvedValueOnce(paramsResponse(URL_A))
      .mockResolvedValueOnce(paramsResponse(URL_B));

    const { result, rerender } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));

    rerender({ patientId: PATIENT_ID, vendorOrderSetId: 999 });

    await waitFor(() => expect(result.current.url).toBe(URL_B));
    expect(post).toHaveBeenCalledTimes(2);
    const [, secondBody] = post.mock.calls[1];
    expect(secondBody).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: PATIENT_ID },
        { name: 'vendorOrderSetId', valueInteger: 999 },
      ],
    });
  });

  test('stale in-flight request does not overwrite newer URL', async () => {
    const medplum = new MockClient();
    let resolveFirst: (value: Parameters) => void = () => undefined;
    const firstPromise = new Promise<Parameters>((r) => {
      resolveFirst = r;
    });

    jest.spyOn(medplum, 'post').mockReturnValueOnce(firstPromise).mockResolvedValueOnce(paramsResponse(URL_B));

    const { result, rerender } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 1,
    });

    rerender({ patientId: PATIENT_ID, vendorOrderSetId: 2 });

    await waitFor(() => expect(result.current.url).toBe(URL_B));

    await act(async () => {
      resolveFirst(paramsResponse(URL_A));
    });

    expect(result.current.url).toBe(URL_B);
  });

  test('captures error from operation call and surfaces it via error state', async () => {
    const medplum = new MockClient();
    const boom = new Error('operation blew up');
    jest.spyOn(medplum, 'post').mockRejectedValue(boom);

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  test('refresh() re-runs the operation call and returns the fresh URL', async () => {
    const medplum = new MockClient();
    jest
      .spyOn(medplum, 'post')
      .mockResolvedValueOnce(paramsResponse(URL_A))
      .mockResolvedValueOnce(paramsResponse(URL_B));

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));

    let refreshed: string | undefined;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(URL_B);
    expect(result.current.url).toBe(URL_B);
  });

  test('refresh() returns undefined when inputs are incomplete', async () => {
    const medplum = new MockClient();
    const post = jest.spyOn(medplum, 'post');

    const { result } = renderOrderSetHook(medplum, {
      patientId: undefined,
    });

    let refreshed: string | undefined = 'sentinel';
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBeUndefined();
    expect(post).not.toHaveBeenCalled();
  });

  test('throws decoding error when server returns a non-Parameters body', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'post').mockResolvedValue({ launchUrl: URL_A });

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect((result.current.error as Error).message).toBe(INVALID_MEDICATION_ORDER_SET_RESPONSE);
    expect(result.current.url).toBeUndefined();
  });

  test('throws decoding error when Parameters payload is missing launchUrl', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [{ name: 'vendorPatientId', valueInteger: 1 }],
    } satisfies Parameters);

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect((result.current.error as Error).message).toBe(INVALID_MEDICATION_ORDER_SET_RESPONSE);
    expect(result.current.url).toBeUndefined();
  });
});
