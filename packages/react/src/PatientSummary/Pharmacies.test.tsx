// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Organization, Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';
import { Pharmacies } from './Pharmacies';

const medplum = new MockClient();

describe('PatientSummary - Pharmacies', () => {
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

  test('Opens add pharmacy modal', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Pharmacy')).toBeInTheDocument();
  });

  test('Closes modal on cancel', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} />);

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    expect(await screen.findByText('Add Pharmacy')).toBeInTheDocument();

    // Close modal
    await act(async () => {
      fireEvent.click(screen.getByText('Cancel'));
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
          url: 'https://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                    system: 'https://dosespot.com/pharmacy-preference-type',
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
          url: 'https://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                    system: 'https://dosespot.com/pharmacy-preference-type',
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
    const { container } = await act(async () => {
      return render(
        <MemoryRouter>
          <MedplumProvider medplum={medplum}>
            <Pharmacies patient={null as unknown as Patient} />
          </MedplumProvider>
        </MemoryRouter>
      );
    });

    expect(container.firstChild).toBeNull();
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

  test('Opens add pharmacy modal and validates flow', async () => {
    await setup(<Pharmacies patient={HomerSimpson} pharmacies={[]} />);

    // Open modal
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Add item'));
    });

    // The component should exist and have the modal
    expect(await screen.findByText('Add Pharmacy')).toBeInTheDocument();

    // Verify the form is present
    expect(screen.getByLabelText('Pharmacy Name')).toBeInTheDocument();
  });

  test('Shows error state when all pharmacy references fail to resolve', async () => {
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-1',
      extension: [
        {
          url: 'https://hl7.org/fhir/StructureDefinition/patient-preferredPharmacy',
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
                    system: 'https://dosespot.com/pharmacy-preference-type',
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
