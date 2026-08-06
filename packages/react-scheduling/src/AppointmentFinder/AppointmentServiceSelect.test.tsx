// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { HealthcareService } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { MainClinic, SchedulingFixtures, UltrasoundImagingService } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AppointmentServiceSelectProps } from './AppointmentServiceSelect';
import { AppointmentServiceSelect, toServiceReference } from './AppointmentServiceSelect';

const medplum = new MockClient();

function setup(props: Partial<AppointmentServiceSelectProps>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<AppointmentServiceSelect service={undefined} onChange={vi.fn()} {...props} />, wrapper);
}

/**
 * Types into the search and waits for it to settle.
 * @param text - What to search for.
 */
async function search(text: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByRole('textbox', { name: 'Search service type' }), { target: { value: text } });
  });
  await act(async () => {
    vi.advanceTimersByTime(300);
  });
}

describe('AppointmentServiceSelect', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(async () => {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  test('Asks only about the service', async () => {
    setup({});
    expect(await screen.findByRole('radiogroup', { name: 'Service type' })).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Location' })).not.toBeInTheDocument();
  });

  test('Only offers services configured for scheduling', async () => {
    setup({});

    await screen.findByRole('radio', { name: /Ultrasound Imaging/ });
    await search('Clinic');

    // "Walk-in Clinic" matches the search but has no SchedulingParameters, so
    // $find could never produce times for it.
    expect(screen.queryByText('Walk-in Clinic')).not.toBeInTheDocument();
    expect(await screen.findByText('No visit types match this search.')).toBeInTheDocument();
  });

  test('Says how long each visit type takes', async () => {
    setup({});

    // The length is what tells two otherwise identical visit types apart.
    expect(await screen.findByRole('radio', { name: /Ultrasound Imaging.*30 min/ })).toBeInTheDocument();
  });

  test('Reports a chosen service', async () => {
    const onChange = vi.fn();
    setup({ onChange });

    const row = await screen.findByRole('radio', { name: /Ultrasound Imaging/ });
    await act(async () => {
      fireEvent.click(row);
    });

    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0][0] as WithId<HealthcareService>).id).toBe('ultrasound-imaging');
  });

  test('Narrows the services to a chosen location', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup({ location: MainClinic });

    await screen.findByRole('radio', { name: /Ultrasound Imaging/ });

    const serviceSearch = searchResources.mock.calls.find((call) => call[0] === 'HealthcareService');
    expect((serviceSearch?.[1] as URLSearchParams).get('location')).toBe('Location/main-clinic');
    expect(screen.getByText(/Showing visit types offered at Uro Associates - Main Clinic/)).toBeInTheDocument();
    searchResources.mockRestore();
  });
});

describe('toServiceReference', () => {
  test('Builds the reference $find takes', () => {
    expect(toServiceReference(UltrasoundImagingService)).toStrictEqual({
      reference: 'HealthcareService/ultrasound-imaging',
      display: 'Ultrasound Imaging',
    });
  });
});
