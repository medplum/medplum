// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference } from '@medplum/core';
import { AllergyIntolerance } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen } from '../test-utils/render';
import { Allergies } from './Allergies';

const medplum = new MockClient();

describe('PatientSummary - Allergies', () => {
  async function setup(children: ReactNode): Promise<void> {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
        </MemoryRouter>
      );
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(async () => {
    await act(async () => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders empty', async () => {
    await setup(<Allergies patient={HomerSimpson} allergies={[]} />);
    expect(screen.getByText('Allergies')).toBeInTheDocument();
  });

  test('Renders existing', async () => {
    await setup(
      <Allergies
        patient={HomerSimpson}
        allergies={[
          {
            resourceType: 'AllergyIntolerance',
            id: 'peanut',
            patient: { reference: 'Patient/123' },
            code: { text: 'Peanut' },
          },
        ]}
      />
    );
    expect(screen.getByText('Allergies')).toBeInTheDocument();
    expect(screen.getByText('Peanut')).toBeInTheDocument();
  });

  test('Add allergy', async () => {
    await setup(<Allergies patient={HomerSimpson} allergies={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Edit allergy', async () => {
    const allergy: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      id: 'peanut',
      patient: createReference(HomerSimpson),
      code: { text: 'Peanut' },
    };

    await setup(<Allergies patient={HomerSimpson} allergies={[allergy]} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Peanut'));
    });

    const input = (await screen.findAllByRole('searchbox'))[0] as HTMLInputElement;

    // Enter random text
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Test' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    // Press the down arrow
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown', code: 'ArrowDown' });
    });

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    expect(screen.getByText('Test Display')).toBeDefined();

    // Click "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
  });

  test('Allergy status colors', async () => {
    await setup(
      <Allergies
        patient={HomerSimpson}
        allergies={[
          {
            resourceType: 'AllergyIntolerance',
            id: 'active',
            patient: createReference(HomerSimpson),
            code: { text: 'Active Allergy' },
            clinicalStatus: {
              coding: [
                {
                  code: 'active',
                  system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                  display: 'Active',
                },
              ],
            },
          },
          {
            resourceType: 'AllergyIntolerance',
            id: 'inactive',
            patient: createReference(HomerSimpson),
            code: { text: 'Inactive Allergy' },
            clinicalStatus: {
              coding: [
                {
                  code: 'inactive',
                  system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                  display: 'Inactive',
                },
              ],
            },
          },
          {
            resourceType: 'AllergyIntolerance',
            id: 'resolved',
            patient: createReference(HomerSimpson),
            code: { text: 'Resolved Allergy' },
            clinicalStatus: {
              coding: [
                {
                  code: 'resolved',
                  system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                  display: 'Resolved',
                },
              ],
            },
          },
          {
            resourceType: 'AllergyIntolerance',
            id: 'unknown',
            patient: createReference(HomerSimpson),
            code: { text: 'Unknown Allergy' },
            clinicalStatus: {
              coding: [
                {
                  code: 'unknown',
                  system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
                  display: 'Unknown',
                },
              ],
            },
          },
        ]}
      />
    );

    const activeBadge = screen.getByText('active').closest('[class*="mantine-Badge-root"]');
    expect(activeBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-red-light-color)' });

    const inactiveBadge = screen.getByText('inactive').closest('[class*="mantine-Badge-root"]');
    expect(inactiveBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-orange-light-color)' });

    const resolvedBadge = screen.getByText('resolved').closest('[class*="mantine-Badge-root"]');
    expect(resolvedBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-blue-light-color)' });

    const unknownBadge = screen.getByText('unknown').closest('[class*="mantine-Badge-root"]');
    expect(unknownBadge).toHaveStyle({ '--badge-color': 'var(--mantine-color-gray-light-color)' });
  });
});
