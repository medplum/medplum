// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Location } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { MainClinic, SatelliteClinic, SchedulingFixtures } from '../stories/scheduling';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { AppointmentLocationSelect } from './AppointmentLocationSelect';

const medplum = new MockClient();

function setup(onChange: (location: WithId<Location> | undefined) => void, location?: WithId<Location>): void {
  const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
    <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
  );
  render(<AppointmentLocationSelect location={location} onChange={onChange} />, wrapper);
}

describe('AppointmentLocationSelect', () => {
  beforeAll(async () => {
    for (const resource of SchedulingFixtures) {
      await medplum.createResource(resource);
    }
  });

  test('Lists every site', async () => {
    setup(vi.fn());

    expect(await screen.findByRole('radio', { name: /Uro Associates - Main Clinic/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Uro Associates - Satellite/ })).toBeInTheDocument();
  });

  test('Has no search field, since a practice has few enough sites to read down', async () => {
    setup(vi.fn());

    await screen.findByRole('radio', { name: /Uro Associates - Main Clinic/ });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  test('Asks for every site at once, since there is no search to reach the rest', async () => {
    const searchResources = vi.spyOn(medplum, 'searchResources');
    setup(vi.fn());

    await screen.findByRole('radio', { name: /Uro Associates - Main Clinic/ });

    const call = searchResources.mock.calls.at(-1);
    expect(call?.[1]).toStrictEqual({ _count: 100, _sort: 'name' });
    searchResources.mockRestore();
  });

  test('Reports a chosen location', async () => {
    const onChange = vi.fn();
    setup(onChange);

    const row = await screen.findByRole('radio', { name: /Uro Associates - Main Clinic/ });
    await act(async () => {
      fireEvent.click(row);
    });

    expect(onChange).toHaveBeenCalled();
    expect((onChange.mock.calls[0][0] as WithId<Location>).id).toBe('main-clinic');
  });

  test('Marks the location already chosen', async () => {
    setup(vi.fn(), MainClinic);
    expect(await screen.findByRole('radio', { name: /Uro Associates - Main Clinic/ })).toBeChecked();
  });

  test('Keeps a chosen site on the list even when it was not among those loaded', async () => {
    const elsewhere: WithId<Location> = { ...SatelliteClinic, id: 'not-loaded', name: 'Uro Associates - Airport' };
    setup(vi.fn(), elsewhere);

    // What is chosen has to stay visible, or the field reads as if nothing is.
    expect(await screen.findByRole('radio', { name: /Uro Associates - Airport/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Uro Associates - Main Clinic/ })).toBeInTheDocument();
  });
});
