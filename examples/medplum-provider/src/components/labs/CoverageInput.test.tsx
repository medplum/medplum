// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { Coverage, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { CoverageInput } from './CoverageInput';
import { useHealthGorillaLabOrder, HealthGorillaLabOrderProvider } from '@medplum/health-gorilla-react';

vi.mock('@medplum/health-gorilla-react', async () => {
  const actual = await vi.importActual('@medplum/health-gorilla-react');
  return {
    ...actual,
    useHealthGorillaLabOrder: vi.fn(),
  };
});

const mockPatient: Patient = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

function createMockCoverage(id: string, display: string): Coverage {
  return {
    resourceType: 'Coverage',
    id,
    status: 'active',
    beneficiary: { reference: 'Patient/patient-123' },
    payor: [{ display }],
  };
}

describe('CoverageInput', () => {
  let medplum: MockClient;
  let mockGetActivePatientCoverages: ReturnType<typeof vi.fn>;
  let mockUpdateBillingInformation: ReturnType<typeof vi.fn>;
  let mockLabOrderReturn: ReturnType<typeof useHealthGorillaLabOrder>;

  beforeEach(() => {
    vi.clearAllMocks();
    medplum = new MockClient();

    mockGetActivePatientCoverages = vi.fn();
    mockUpdateBillingInformation = vi.fn();

    mockLabOrderReturn = {
      state: {
        performingLab: undefined,
        performingLabAccountNumber: undefined,
        selectedTests: [],
        testMetadata: {},
        diagnoses: [],
        billingInformation: {
          billTo: 'insurance',
        },
        specimenCollectedDateTime: undefined,
        orderNotes: undefined,
      },
      removeDiagnosis: vi.fn(),
      setDiagnoses: vi.fn(),
      getActivePatientCoverages: mockGetActivePatientCoverages,
      updateBillingInformation: mockUpdateBillingInformation,
      setSpecimenCollectedDateTime: vi.fn(),
      setOrderNotes: vi.fn(),
      validateOrder: vi.fn().mockReturnValue(undefined),
      createOrderBundle: vi.fn(),
      searchAvailableLabs: vi.fn().mockResolvedValue([]),
      searchAvailableTests: vi.fn().mockResolvedValue([]),
      setPerformingLab: vi.fn(),
      setPerformingLabAccountNumber: vi.fn(),
      addTest: vi.fn(),
      removeTest: vi.fn(),
      setTests: vi.fn(),
      updateTestMetadata: vi.fn(),
      addDiagnosis: vi.fn(),
    } as any;

    vi.mocked(useHealthGorillaLabOrder).mockReturnValue(mockLabOrderReturn);
  });

  function setup(props: { patient?: Patient; error?: { message: string } } = {}): void {
    const patient = props.patient || mockPatient;
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <HealthGorillaLabOrderProvider {...mockLabOrderReturn}>
              <CoverageInput patient={patient} error={props.error} />
            </HealthGorillaLabOrderProvider>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  }

  test('Renders "No coverages found" when no coverages exist', async () => {
    mockGetActivePatientCoverages.mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('No coverages found')).toBeInTheDocument();
    });

    expect(mockGetActivePatientCoverages).toHaveBeenCalled();
  });

  test('Renders coverages list when coverages exist', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Blue Cross Blue Shield'),
      createMockCoverage('coverage-2', 'Aetna'),
      createMockCoverage('coverage-3', 'United Healthcare'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Blue Cross Blue Shield')).toBeInTheDocument();
    });

    expect(screen.getByText('Blue Cross Blue Shield')).toBeInTheDocument();
    expect(screen.getByText('Aetna')).toBeInTheDocument();
    expect(screen.getByText('United Healthcare')).toBeInTheDocument();
  });

  test('Displays coverage numbers correctly (1-3)', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
      createMockCoverage('coverage-3', 'Insurance 3'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    expect(screen.getByText('3.')).toBeInTheDocument();
  });

  test('Shows divider after third coverage when more than 3 coverages exist', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
      createMockCoverage('coverage-3', 'Insurance 3'),
      createMockCoverage('coverage-4', 'Insurance 4'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 4')).toBeInTheDocument();
    });

    expect(screen.getByText('Additional coverages that will not be submitted')).toBeInTheDocument();

    const numberTexts = screen.queryAllByText('4.');
    expect(numberTexts).toHaveLength(0);
  });

  test('Displays "Unknown" when coverage has no payor display', async () => {
    const coverage: Coverage = {
      resourceType: 'Coverage',
      id: 'coverage-1',
      status: 'active',
      beneficiary: { reference: 'Patient/patient-123' },
      payor: [{ reference: 'Organization/org-1' }],
    };
    mockGetActivePatientCoverages.mockResolvedValue([coverage]);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Unknown')).toBeInTheDocument();
    });
  });

  test('Calls updateBillingInformation with selected coverages (first 3)', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
      createMockCoverage('coverage-3', 'Insurance 3'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    await waitFor(() => {
      const calls = mockUpdateBillingInformation.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].patientCoverage).toHaveLength(3);
    });

    const lastCall = mockUpdateBillingInformation.mock.calls[mockUpdateBillingInformation.mock.calls.length - 1];
    expect(lastCall[0].patientCoverage).toEqual([coverages[0], coverages[1], coverages[2]]);
  });

  test('Calls updateBillingInformation with empty array when no coverages', async () => {
    mockGetActivePatientCoverages.mockResolvedValue([]);
    setup();

    await waitFor(() => {
      expect(mockUpdateBillingInformation).toHaveBeenCalled();
    });

    expect(mockUpdateBillingInformation).toHaveBeenCalledWith({
      patientCoverage: [],
    });
  });

  test('Moves coverage up when "Move up" button is clicked', async () => {
    const user = userEvent.setup();
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 2')).toBeInTheDocument();
    });

    const moveUpButtons = screen.getAllByLabelText('Move up');
    const secondItemMoveUp = moveUpButtons[1];
    expect(secondItemMoveUp).not.toBeDisabled();

    await act(async () => {
      await user.click(secondItemMoveUp);
    });

    await waitFor(() => {
      const texts = screen.getAllByText(/Insurance/);
      expect(texts[0]).toHaveTextContent('Insurance 2');
    });
  });

  test('Moves coverage down when "Move down" button is clicked', async () => {
    const user = userEvent.setup();
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    const moveDownButtons = screen.getAllByLabelText('Move down');
    const firstItemMoveDown = moveDownButtons[0];
    expect(firstItemMoveDown).not.toBeDisabled();

    await act(async () => {
      await user.click(firstItemMoveDown);
    });

    await waitFor(() => {
      const texts = screen.getAllByText(/Insurance/);
      expect(texts[0]).toHaveTextContent('Insurance 2');
    });
  });

  test('Disables "Move up" button for first item', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    const moveUpButtons = screen.getAllByLabelText('Move up');
    expect(moveUpButtons[0]).toBeDisabled();
    expect(moveUpButtons[1]).not.toBeDisabled();
  });

  test('Disables "Move down" button for last item', async () => {
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 2')).toBeInTheDocument();
    });

    const moveDownButtons = screen.getAllByLabelText('Move down');
    expect(moveDownButtons[1]).toBeDisabled();
    expect(moveDownButtons[0]).not.toBeDisabled();
  });

  test('Disables all controls when billTo is not "insurance"', async () => {
    mockLabOrderReturn.state.billingInformation.billTo = 'patient';
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    const moveUpButtons = screen.getAllByLabelText('Move up');
    const moveDownButtons = screen.getAllByLabelText('Move down');

    moveUpButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
    moveDownButtons.forEach((button) => {
      expect(button).toBeDisabled();
    });
  });

  test('Displays error message when error prop is provided', async () => {
    const error = { message: 'Invalid coverage selection' };
    mockGetActivePatientCoverages.mockResolvedValue([]);
    setup({ error });

    await waitFor(() => {
      expect(screen.getByText('Invalid coverage selection')).toBeInTheDocument();
    });
  });

  test('Re-fetches coverages when patient changes', async () => {
    const coverages1 = [createMockCoverage('coverage-1', 'Insurance 1')];
    mockGetActivePatientCoverages.mockResolvedValue(coverages1);
    const { rerender } = render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <HealthGorillaLabOrderProvider {...mockLabOrderReturn}>
              <CoverageInput patient={mockPatient} />
            </HealthGorillaLabOrderProvider>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    const newPatient: Patient = {
      resourceType: 'Patient',
      id: 'patient-456',
      name: [{ given: ['Jane'], family: 'Smith' }],
    };

    const coverages2 = [createMockCoverage('coverage-2', 'Insurance 2')];
    mockGetActivePatientCoverages.mockResolvedValue(coverages2);

    rerender(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <HealthGorillaLabOrderProvider {...mockLabOrderReturn}>
              <CoverageInput patient={newPatient} />
            </HealthGorillaLabOrderProvider>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Insurance 2')).toBeInTheDocument();
    });

    expect(mockGetActivePatientCoverages).toHaveBeenCalledTimes(2);
  });

  test('Handles error when getActivePatientCoverages fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGetActivePatientCoverages.mockRejectedValue(new Error('Failed to fetch coverages'));
    setup();

    await waitFor(() => {
      expect(screen.getByText('No coverages found')).toBeInTheDocument();
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  test('Updates billing information when coverages are reordered', async () => {
    const user = userEvent.setup();
    const coverages = [
      createMockCoverage('coverage-1', 'Insurance 1'),
      createMockCoverage('coverage-2', 'Insurance 2'),
      createMockCoverage('coverage-3', 'Insurance 3'),
    ];
    mockGetActivePatientCoverages.mockResolvedValue(coverages);
    setup();

    await waitFor(() => {
      expect(screen.getByText('Insurance 1')).toBeInTheDocument();
    });

    mockUpdateBillingInformation.mockClear();

    const moveDownButtons = screen.getAllByLabelText('Move down');
    await act(async () => {
      await user.click(moveDownButtons[0]);
    });

    await waitFor(() => {
      expect(mockUpdateBillingInformation).toHaveBeenCalled();
    });

    const lastCall = mockUpdateBillingInformation.mock.calls[mockUpdateBillingInformation.mock.calls.length - 1];
    expect(lastCall[0].patientCoverage).toHaveLength(3);
    expect(lastCall[0].patientCoverage[0].id).toBe('coverage-2');
  });
});
