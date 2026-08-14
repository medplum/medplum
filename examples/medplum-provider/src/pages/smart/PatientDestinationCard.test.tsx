// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { PatientDestinationCardProps } from './PatientDestinationCard';
import { PatientDestinationCard } from './PatientDestinationCard';

const PATIENT: Patient = {
  resourceType: 'Patient',
  id: 'homer',
  name: [{ given: ['Homer'], family: 'Simpson' }],
  birthDate: '1956-05-12',
};

describe('PatientDestinationCard', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  function setup(props: Partial<PatientDestinationCardProps> = {}): ReturnType<typeof render> {
    return render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <PatientDestinationCard patient={PATIENT} selected={false} {...props} />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders a read-only card without onClick', () => {
    setup();
    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Born 1956-05-12')).toBeInTheDocument();
    // No onClick means this is a summary of a destination already chosen, not a choice to make.
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  test('Renders a radio when selectable', async () => {
    const onClick = vi.fn();
    setup({ onClick, selected: true });

    const radio = screen.getByRole('radio');
    expect(radio).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(radio);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  test('Reports an unselected radio', () => {
    setup({ onClick: vi.fn(), selected: false });
    expect(screen.getByRole('radio')).toHaveAttribute('aria-checked', 'false');
  });

  test('Falls back to a placeholder when the patient has no birth date', () => {
    setup({ patient: { ...PATIENT, birthDate: undefined } });
    expect(screen.getByText('No birth date')).toBeInTheDocument();
  });

  test('Prefers explicit secondary text over the birth date', () => {
    setup({ secondaryText: 'Born 1956-05-12 · MRN 1234' });
    expect(screen.getByText('Born 1956-05-12 · MRN 1234')).toBeInTheDocument();
  });

  test('Badges a new patient destination', () => {
    setup({ showNewPatientBadge: true });
    expect(screen.getByText('Create New Patient')).toBeInTheDocument();
  });

  test('Capitalizes the match grade in its badge', () => {
    setup({ matchGrade: 'certain' });
    expect(screen.getByText('Certain Match')).toBeInTheDocument();
  });

  test('Renders non-certain grades too', () => {
    setup({ matchGrade: 'possible' });
    expect(screen.getByText('Possible Match')).toBeInTheDocument();
  });

  test('Renders nothing while a patient reference is unresolved', async () => {
    const readReference = vi.spyOn(medplum, 'readReference');
    const { container } = setup({ patient: { reference: 'Patient/missing' } as Reference<Patient> });

    await waitFor(() => expect(readReference).toHaveBeenCalled());
    expect(container.querySelector('[class*="mantine-Paper-root"]')).toBeNull();
  });
});
