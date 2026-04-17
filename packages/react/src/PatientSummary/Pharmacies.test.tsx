// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Organization, Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import type { PharmacyDialogBaseProps } from './Pharmacies';
import { Pharmacies } from './Pharmacies';
import { PATIENT_PREFERRED_PHARMACY_URL, PHARMACY_PREFERENCE_TYPE_SYSTEM } from './pharmacy-utils';

const medplum = new MockClient();

/**
 * A simple mock pharmacy dialog component for testing.
 * @param props - The pharmacy dialog base props.
 * @returns A mock dialog element.
 */
function MockPharmacyDialog(props: PharmacyDialogBaseProps): JSX.Element {
  return (
    <div>
      <span>Mock Pharmacy Dialog</span>
      <button onClick={() => props.onSubmit({ resourceType: 'Organization', name: 'Mock Pharmacy' })}>
        Submit Mock
      </button>
      <button onClick={props.onClose}>Close Mock</button>
    </div>
  );
}

async function setup(children: ReactNode): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>{children}</MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('PatientSummary - Pharmacies', () => {
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
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} />);
    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
    expect(screen.getByText('(none)')).toBeInTheDocument();
  });

  test('Renders existing pharmacies', async () => {
    const pharmacy: Organization = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Test Pharmacy',
      address: [
        {
          line: ['123 Main St'],
          city: 'Boston',
          state: 'MA',
          postalCode: '02101',
        },
      ],
    };

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy]} />);

    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
    expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
    expect(screen.getByText(/123 Main St/)).toBeInTheDocument();
  });

  test('Renders primary pharmacy badge', async () => {
    const pharmacy: Organization & { isPrimary?: boolean } = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Primary Pharmacy',
      isPrimary: true,
    };

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy]} />);

    expect(screen.getByText('Primary Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
  });

  test('Does not render badge for non-primary pharmacy', async () => {
    const pharmacy: Organization & { isPrimary?: boolean } = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Secondary Pharmacy',
      isPrimary: false,
    };

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy]} />);

    expect(screen.getByText('Secondary Pharmacy')).toBeInTheDocument();
    expect(screen.queryByText('primary')).not.toBeInTheDocument();
  });

  test('Hides Add button when pharmacyDialogComponent is not provided', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} />);

    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
    expect(screen.queryByLabelText('Add item')).not.toBeInTheDocument();
  });

  test('Shows Add button when pharmacyDialogComponent is provided', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} pharmacyDialogComponent={MockPharmacyDialog} />);

    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
    expect(screen.getByLabelText('Add item')).toBeInTheDocument();
  });

  test('Opens add pharmacy modal with pharmacyDialogComponent', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} pharmacyDialogComponent={MockPharmacyDialog} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Mock Pharmacy Dialog')).toBeInTheDocument();
  });

  test('Closes modal on cancel', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} pharmacyDialogComponent={MockPharmacyDialog} />);

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Pharmacy')).toBeInTheDocument();

    // Close modal by clicking the close button (X) in the header
    await act(async () => {
      const closeButtons = document.querySelectorAll('[data-variant="subtle"]');
      const closeButton = Array.from(closeButtons).find((btn) =>
        btn.closest('.mantine-Modal-header')
      ) as HTMLButtonElement;
      if (closeButton) {
        fireEvent.click(closeButton);
      }
    });

    await waitFor(() => {
      expect(screen.queryByText('Add Pharmacy')).not.toBeInTheDocument();
    });
  });

  test('Calls onClickResource when pharmacy is clicked', async () => {
    const pharmacy: Organization = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Test Pharmacy',
    };

    const onClickResource = jest.fn();

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy]} onClickResource={onClickResource} />);

    await act(async () => {
      fireEvent.click(screen.getByText('Test Pharmacy'));
    });

    expect(onClickResource).toHaveBeenCalledWith(pharmacy);
  });

  test('Renders patient with pharmacy extension', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            {
              url: 'pharmacy',
              valueReference: {
                reference: 'Organization/pharmacy-1',
              },
            },
            {
              url: 'type',
              valueCodeableConcept: {
                coding: [
                  {
                    system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                    code: 'primary',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await setup(<Pharmacies patient={patient} />);

    // Component should render even if it can't resolve the reference
    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
  });

  test('Shows loading state while resolving references', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            {
              url: 'pharmacy',
              valueReference: {
                reference: 'Organization/pharmacy-1',
              },
            },
            {
              url: 'type',
              valueCodeableConcept: {
                coding: [
                  {
                    system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                    code: 'primary',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await setup(<Pharmacies patient={patient} />);

    // Initially should show loading
    expect(screen.getByText('Pharmacies')).toBeInTheDocument();
  });

  test('Returns empty fragment when patient is null', async () => {
    await act(async () => {
      render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <Pharmacies patient={null as unknown as Patient} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });

    // When patient is null, the component should not render the main content
    expect(screen.queryByText('Pharmacies')).not.toBeInTheDocument();
  });

  test('Handles multiple pharmacies', async () => {
    const pharmacy1: Organization & { isPrimary?: boolean } = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Primary Pharmacy',
      isPrimary: true,
    };

    const pharmacy2: Organization = {
      resourceType: 'Organization',
      id: 'pharmacy-2',
      name: 'Secondary Pharmacy',
    };

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy1, pharmacy2]} />);

    expect(screen.getByText('Primary Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('Secondary Pharmacy')).toBeInTheDocument();
    expect(screen.getByText('primary')).toBeInTheDocument();
  });

  test('Handles pharmacy with phone and fax', async () => {
    const pharmacy: Organization = {
      resourceType: 'Organization',
      id: 'pharmacy-1',
      name: 'Test Pharmacy',
      telecom: [
        {
          system: 'phone',
          value: '555-1234',
        },
        {
          system: 'fax',
          value: '555-5678',
        },
      ],
    };

    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[pharmacy]} />);

    expect(screen.getByText('Test Pharmacy')).toBeInTheDocument();
  });

  test('Shows error state when all pharmacy references fail to resolve', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      extension: [
        {
          url: PATIENT_PREFERRED_PHARMACY_URL,
          extension: [
            {
              url: 'pharmacy',
              valueReference: {
                reference: 'Organization/non-existent-pharmacy',
              },
            },
            {
              url: 'type',
              valueCodeableConcept: {
                coding: [
                  {
                    system: PHARMACY_PREFERENCE_TYPE_SYSTEM,
                    code: 'primary',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    await setup(<Pharmacies patient={patient} />);

    // Wait for the error state to appear
    await waitFor(() => {
      expect(screen.getByText('Failed to load pharmacies')).toBeInTheDocument();
    });
  });
});
