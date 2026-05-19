// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { useScriptSureOrderSet } from './useScriptSureOrderSet';

const URL_A = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokA';
const URL_B = 'https://ssu.scriptsure.com/widgets/prescription/order-set/100/377?sessiontoken=tokB';
const OPERATION_URL = 'fhir/R4/PlanDefinition/$order-set-url';

function paramsResponse(launchUrl: string): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [{ name: 'launchUrl', valueUri: launchUrl }],
  };
}

function wrapper(medplum: MockClient) {
  return function Wrapper(props: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{props.children}</MedplumProvider>;
  };
}

describe('useScriptSureOrderSet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('forwards scriptSureOrdersetId to the $order-set-url operation as vendorOrderSetId', async () => {
    const medplum = new MockClient();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue(paramsResponse(URL_A));

    const { result } = renderHook(() => useScriptSureOrderSet({ patientId: 'p1', scriptSureOrdersetId: 377 }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));
    expect(post).toHaveBeenCalledTimes(1);
    const [calledUrl, body] = post.mock.calls[0];
    expect(calledUrl.toString()).toContain(OPERATION_URL);
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'vendorOrderSetId', valueInteger: 377 },
      ],
    });
  });

  test('forwards planDefinitionId branch when no scriptSureOrdersetId is set', async () => {
    const medplum = new MockClient();
    const post = vi.spyOn(medplum, 'post').mockResolvedValue(paramsResponse(URL_A));

    renderHook(() => useScriptSureOrderSet({ patientId: 'p1', planDefinitionId: 'pd-1' }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(post).toHaveBeenCalled());
    const [, body] = post.mock.calls[0];
    expect(body).toMatchObject({
      resourceType: 'Parameters',
      parameter: [
        { name: 'patientId', valueId: 'p1' },
        { name: 'planDefinitionId', valueId: 'pd-1' },
      ],
    });
  });

  test('refresh() returns the latest URL', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'post').mockResolvedValueOnce(paramsResponse(URL_A)).mockResolvedValueOnce(paramsResponse(URL_B));

    const { result } = renderHook(() => useScriptSureOrderSet({ patientId: 'p1', scriptSureOrdersetId: 377 }), {
      wrapper: wrapper(medplum),
    });

    await waitFor(() => expect(result.current.url).toBe(URL_A));

    let refreshed: string | undefined;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toBe(URL_B);
    expect(result.current.url).toBe(URL_B);
  });
});
