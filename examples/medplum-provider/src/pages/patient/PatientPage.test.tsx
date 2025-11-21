// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { OperationOutcome, Patient } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { PatientPage } from './PatientPage';

// Mock the usePatient hook
const mockUsePatient = vi.fn();
vi.mock('../../hooks/usePatient', () => ({
  usePatient: (options?: { setOutcome?: (outcome: OperationOutcome) => void }) => {
    return mockUsePatient(options);
  },
}));

// Mock the Outlet component
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>,
  };
});

const mockPatient: Patient = HomerSimpson;

describe('PatientPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (
    initialPath = '/Patient/patient-123',
    patient?: Patient,
    outcome?: OperationOutcome
  ): ReturnType<typeof render> => {
    if (outcome) {
      // Simulate setOutcome being called
      mockUsePatient.mockImplementation((options?: { setOutcome?: (outcome: OperationOutcome) => void }) => {
        if (options?.setOutcome) {
          // Call setOutcome asynchronously to simulate the hook behavior
          setTimeout(() => options.setOutcome?.(outcome), 0);
        }
        return undefined;
      });
    } else {
      mockUsePatient.mockReturnValue(patient);
    }

    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <PatientPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  it('shows loader when patient is loading', async () => {
    mockUsePatient.mockReturnValue(undefined);
    await act(async () => {
      setup('/Patient/patient-123', undefined);
    });

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  it('renders patient page when patient is loaded', async () => {
    await act(async () => {
      setup('/Patient/patient-123', mockPatient);
    });

    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });

  it('renders all tabs in navigation', async () => {
    await act(async () => {
      setup('/Patient/patient-123', mockPatient);
    });

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    // Check for some key tabs
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Meds')).toBeInTheDocument();
  });

  it('sets initial tab from URL path', async () => {
    await act(async () => {
      setup('/Patient/patient-123/edit', mockPatient);
    });

    await waitFor(() => {
      const editTab = screen.getByText('Edit');
      expect(editTab).toBeInTheDocument();
      expect(editTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('handles tab change when clicking on tab', async () => {
    const user = userEvent.setup();
    await act(async () => {
      setup('/Patient/patient-123', mockPatient);
    });

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    const editTab = screen.getByText('Edit');
    await user.click(editTab);

    await waitFor(() => {
      const editTab = screen.getByText('Edit');
      expect(editTab).toBeInTheDocument();
      expect(editTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('does not show tabs when patient is loading', async () => {
    mockUsePatient.mockReturnValue(undefined);
    await act(async () => {
      setup('/Patient/patient-123', undefined);
    });

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });

    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  it('defaults to timeline tab when URL does not match any tab', async () => {
    await act(async () => {
      setup('/Patient/patient-123/unknown-path', mockPatient);
    });

    await waitFor(() => {
      const timelineTab = screen.getByText('Timeline');
      expect(timelineTab).toBeInTheDocument();
      expect(timelineTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('renders homer summary information in sidebar', async () => {
    await act(async () => {
      setup('/Patient/patient-123', mockPatient);
    });

    // Wait for outlet to ensure sidebar/page structure rendered
    await waitFor(() => {
      expect(screen.getByTestId('outlet')).toBeInTheDocument();
    });

    expect(screen.getByText('Homer Simpson')).toBeInTheDocument();
    expect(screen.getByText('Male')).toBeInTheDocument();
    expect(screen.getByText('1956-05-12 (069Y)')).toBeInTheDocument();
  });

  it('handles empty pathname correctly', async () => {
    await act(async () => {
      setup('/Patient/patient-123/', mockPatient);
    });

    await waitFor(() => {
      const timelineTab = screen.getByText('Timeline');
      expect(timelineTab).toBeInTheDocument();
      expect(timelineTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('highlights the Edit tab in a case-insensitive way even when /EDIT is used', async () => {
    await act(async () => {
      setup('/Patient/patient-123/EDIT', mockPatient);
    });

    await waitFor(() => {
      const editTab = screen.getByText('Edit');
      expect(editTab).toBeInTheDocument();

      // Mantine's Tab component adds an aria-selected="true" on the selected tab
      expect(editTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });
});
