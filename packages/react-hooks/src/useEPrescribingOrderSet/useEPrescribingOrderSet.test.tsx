// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { MedplumProvider } from '../MedplumProvider/MedplumProvider';
import type { UseEPrescribingOrderSetOptions } from './useEPrescribingOrderSet';
import { useEPrescribingOrderSet } from './useEPrescribingOrderSet';

const ORDER_SET_BOT = { system: 'https://www.medplum.com/bots', value: 'order-set-bot' };
const PATIENT_ID = 'patient-1';
const SCRIPTSURE_URL_A =
  'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokA&darkmode=off';
const SCRIPTSURE_URL_B =
  'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokB&darkmode=off';

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

function renderOrderSetHook(
  medplum: MockClient,
  options: UseEPrescribingOrderSetOptions
): ReturnType<typeof renderHook<ReturnType<typeof useEPrescribingOrderSet>, UseEPrescribingOrderSetOptions>> {
  return renderHook((opts: UseEPrescribingOrderSetOptions) => useEPrescribingOrderSet(ORDER_SET_BOT, opts), {
    wrapper: wrapper(medplum),
    initialProps: options,
  });
}

describe('useEPrescribingOrderSet', () => {
  test('happy path — calls bot with default vendorOrderSetId field and exposes URL', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot').mockResolvedValue({ url: SCRIPTSURE_URL_A });

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
      darkmode: 'off',
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(exec).toHaveBeenCalledTimes(1);
    expect(exec).toHaveBeenCalledWith(ORDER_SET_BOT, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
      darkmode: 'off',
    });
    expect(result.current.url).toBe(SCRIPTSURE_URL_A);
    expect(result.current.error).toBeUndefined();
  });

  test('uses caller-supplied vendorOrderSetIdField when sending bot payload', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot').mockResolvedValue({ url: SCRIPTSURE_URL_A });

    renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
      vendorOrderSetIdField: 'scriptSureOrdersetId',
    });

    await waitFor(() => expect(exec).toHaveBeenCalled());
    expect(exec).toHaveBeenCalledWith(ORDER_SET_BOT, {
      patientId: PATIENT_ID,
      scriptSureOrdersetId: 377,
    });
  });

  test('forwards planDefinitionId when no vendor id is set', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot').mockResolvedValue({ url: SCRIPTSURE_URL_A });

    renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      planDefinitionId: 'pd-1',
    });

    await waitFor(() => expect(exec).toHaveBeenCalled());
    expect(exec).toHaveBeenCalledWith(ORDER_SET_BOT, {
      patientId: PATIENT_ID,
      planDefinitionId: 'pd-1',
    });
  });

  test('stays idle (no bot call, no URL) when patientId is undefined', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot');

    const { result } = renderOrderSetHook(medplum, {
      patientId: undefined,
      vendorOrderSetId: 377,
    });

    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(exec).not.toHaveBeenCalled();
  });

  test('stays idle when neither planDefinitionId nor vendorOrderSetId is set', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot');

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
    });

    expect(result.current.url).toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });

  test('clears URL and reruns when inputs change (abort-on-change semantics)', async () => {
    const medplum = new MockClient();
    const exec = jest
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({ url: SCRIPTSURE_URL_A })
      .mockResolvedValueOnce({ url: SCRIPTSURE_URL_B });

    const { result, rerender } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.url).toBe(SCRIPTSURE_URL_A));

    rerender({ patientId: PATIENT_ID, vendorOrderSetId: 999 });

    await waitFor(() => expect(result.current.url).toBe(SCRIPTSURE_URL_B));
    expect(exec).toHaveBeenCalledTimes(2);
    expect(exec).toHaveBeenNthCalledWith(2, ORDER_SET_BOT, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 999,
    });
  });

  test('stale in-flight request does not overwrite newer URL', async () => {
    const medplum = new MockClient();
    let resolveFirst: (value: { url: string }) => void = () => undefined;
    const firstPromise = new Promise<{ url: string }>((r) => {
      resolveFirst = r;
    });

    jest
      .spyOn(medplum, 'executeBot')
      .mockReturnValueOnce(firstPromise)
      .mockResolvedValueOnce({ url: SCRIPTSURE_URL_B });

    const { result, rerender } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 1,
    });

    rerender({ patientId: PATIENT_ID, vendorOrderSetId: 2 });

    await waitFor(() => expect(result.current.url).toBe(SCRIPTSURE_URL_B));

    await act(async () => {
      resolveFirst({ url: SCRIPTSURE_URL_A });
    });

    expect(result.current.url).toBe(SCRIPTSURE_URL_B);
  });

  test('captures error from bot call and surfaces it via error state', async () => {
    const medplum = new MockClient();
    const boom = new Error('bot blew up');
    jest.spyOn(medplum, 'executeBot').mockRejectedValue(boom);

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.error).toBe(boom));
    expect(result.current.url).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });

  test('refresh() re-runs the bot call and returns the fresh URL', async () => {
    const medplum = new MockClient();
    jest
      .spyOn(medplum, 'executeBot')
      .mockResolvedValueOnce({ url: SCRIPTSURE_URL_A })
      .mockResolvedValueOnce({ url: SCRIPTSURE_URL_B });

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.url).toBe(SCRIPTSURE_URL_A));

    let refreshed: string | undefined;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(SCRIPTSURE_URL_B);
    expect(result.current.url).toBe(SCRIPTSURE_URL_B);
  });

  test('refresh() returns undefined when inputs are incomplete', async () => {
    const medplum = new MockClient();
    const exec = jest.spyOn(medplum, 'executeBot');

    const { result } = renderOrderSetHook(medplum, {
      patientId: undefined,
    });

    let refreshed: string | undefined = 'sentinel';
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBeUndefined();
    expect(exec).not.toHaveBeenCalled();
  });

  test('omits url when bot result has no url field', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'executeBot').mockResolvedValue({ scriptSurePatientId: 1 });

    const { result } = renderOrderSetHook(medplum, {
      patientId: PATIENT_ID,
      vendorOrderSetId: 377,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.url).toBeUndefined();
    expect(result.current.error).toBeUndefined();
  });
});
