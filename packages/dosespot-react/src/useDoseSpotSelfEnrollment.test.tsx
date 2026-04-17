// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, renderHook } from '@testing-library/react';
import type { JSX, ReactNode } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';
import type { DoseSpotSelfEnrollmentOptions, DoseSpotSelfEnrollmentResult } from './useDoseSpotSelfEnrollment';
import { useDoseSpotSelfEnrollment } from './useDoseSpotSelfEnrollment';

const mockEnrollResult: DoseSpotSelfEnrollmentResult = {
  status: 'created',
  doseSpotClinicianId: 999,
  registrationStatus: 'Pending',
  epcsEnabled: false,
  nextSteps: ['Sign the DoseSpot legal agreement in the iframe to continue enrollment.'],
};

describe('useDoseSpotSelfEnrollment', () => {
  let medplum: MedplumClient;

  beforeEach(() => {
    vi.resetAllMocks();
    medplum = new MockClient();
  });

  function wrapper({ children }: { children: ReactNode }): JSX.Element {
    return <MedplumProvider medplum={medplum}>{children}</MedplumProvider>;
  }

  test('successful enrollment', async () => {
    const onSuccess = vi.fn();
    vi.spyOn(medplum, 'executeBot').mockResolvedValueOnce(mockEnrollResult);

    const { result } = renderHook((props: DoseSpotSelfEnrollmentOptions) => useDoseSpotSelfEnrollment(props), {
      wrapper,
      initialProps: { onSuccess },
    });

    await act(async () => {});

    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT, {});
    expect(onSuccess).toHaveBeenCalledWith(mockEnrollResult);
    expect(result.current.result?.status).toBe('created');
    expect(result.current.loading).toBe(false);
    expect(result.current.result?.nextSteps).toContain(
      'Sign the DoseSpot legal agreement in the iframe to continue enrollment.'
    );
  });

  test('error handling', async () => {
    const onError = vi.fn();
    const mockError = new Error('Not authorized');
    vi.spyOn(medplum, 'executeBot').mockRejectedValueOnce(mockError);

    const { result } = renderHook((props: DoseSpotSelfEnrollmentOptions) => useDoseSpotSelfEnrollment(props), {
      wrapper,
      initialProps: { onError },
    });

    await act(async () => {});

    expect(onError).toHaveBeenCalledWith(mockError);
    expect(result.current.result).toBeUndefined();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(mockError);
  });

  test('disabled does not call bot', async () => {
    vi.spyOn(medplum, 'executeBot');

    const { result } = renderHook(() => useDoseSpotSelfEnrollment({ enabled: false }), { wrapper });

    await act(async () => {});

    expect(medplum.executeBot).not.toHaveBeenCalled();
    expect(result.current.result).toBeUndefined();
    expect(result.current.loading).toBe(false);
  });
});
