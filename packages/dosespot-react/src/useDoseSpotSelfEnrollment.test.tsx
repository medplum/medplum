// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { act, render, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { vi } from 'vitest';
import { DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT } from './common';
import type { DoseSpotSelfEnrollmentOptions, DoseSpotSelfEnrollmentResult } from './useDoseSpotSelfEnrollment';
import { useDoseSpotSelfEnrollment } from './useDoseSpotSelfEnrollment';

function TestComponent({ options }: { options?: DoseSpotSelfEnrollmentOptions }): JSX.Element {
  const { result, loading, error } = useDoseSpotSelfEnrollment(options);
  return (
    <div>
      <div>loading: {String(loading)}</div>
      <div>status: {result?.status ?? 'none'}</div>
      <div>error: {error ? String(error) : 'none'}</div>
      <div>nextSteps: {result?.nextSteps?.join('; ') ?? 'none'}</div>
    </div>
  );
}

const mockEnrollResult: DoseSpotSelfEnrollmentResult = {
  status: 'created',
  doseSpotClinicianId: 999,
  registrationStatus: 'Pending',
  epcsEnabled: false,
  nextSteps: ['Sign the DoseSpot legal agreement in the iframe to continue enrollment.'],
};

describe('useDoseSpotSelfEnrollment', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  test('successful enrollment', async () => {
    const medplum = new MockClient();
    const onSuccess = vi.fn();

    medplum.executeBot = vi.fn().mockResolvedValueOnce(mockEnrollResult);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent options={{ onSuccess }} />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).toHaveBeenCalledTimes(1);
    expect(medplum.executeBot).toHaveBeenCalledWith(DOSESPOT_SELF_ENROLL_PRESCRIBER_BOT, {});
    expect(onSuccess).toHaveBeenCalledWith(mockEnrollResult);
    expect(screen.getByText('status: created')).toBeDefined();
    expect(screen.getByText('loading: false')).toBeDefined();
    expect(screen.getByText(/Sign the DoseSpot legal agreement/)).toBeDefined();
  });

  test('error handling', async () => {
    const medplum = new MockClient();
    const onError = vi.fn();
    const mockError = new Error('Not authorized');

    medplum.executeBot = vi.fn().mockRejectedValueOnce(mockError);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent options={{ onError }} />
        </MedplumProvider>
      );
    });

    expect(onError).toHaveBeenCalledWith(mockError);
    expect(screen.getByText('status: none')).toBeDefined();
    expect(screen.getByText('loading: false')).toBeDefined();
    expect(screen.getByText(/Error: Not authorized/)).toBeDefined();
  });

  test('disabled does not call bot', async () => {
    const medplum = new MockClient();
    medplum.executeBot = vi.fn();

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <TestComponent options={{ enabled: false }} />
        </MedplumProvider>
      );
    });

    expect(medplum.executeBot).not.toHaveBeenCalled();
    expect(screen.getByText('status: none')).toBeDefined();
    expect(screen.getByText('loading: false')).toBeDefined();
  });
});
