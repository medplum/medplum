// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import * as medplumReact from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { PatientPage } from './PatientPage';
import { TimelineTab } from './TimelineTab';
import { EditTab } from './EditTab';

describe('PatientPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialPath = '/Patient/patient-123'): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[initialPath]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/Patient/:patientId/*" element={<PatientPage />}>
                <Route path="edit" element={<EditTab />} />
                <Route path="" element={<TimelineTab />} />
                <Route path="*" element={<TimelineTab />} />
              </Route>
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('shows loader when patient is loading', async () => {
    // Use a non-existent patient ID to simulate loading
    setup('/Patient/non-existent-patient');

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });
  });

  test('renders patient page when patient is loaded', async () => {
    setup(`/Patient/${HomerSimpson.id}`);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });
  });

  test('renders all tabs in navigation', async () => {
    setup(`/Patient/${HomerSimpson.id}`);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    // Check for some key tabs
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Meds')).toBeInTheDocument();
  });

  test('sets initial tab from URL path', async () => {
    setup(`/Patient/${HomerSimpson.id}/edit`);

    await waitFor(() => {
      const editTab = screen.getByText('Edit');
      expect(editTab).toBeInTheDocument();
      expect(editTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('handles tab change when clicking on tab', async () => {
    const user = userEvent.setup();
    setup(`/Patient/${HomerSimpson.id}`);

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

  test('does not show tabs when patient is loading', async () => {
    setup('/Patient/non-existent-patient');

    await waitFor(() => {
      const loader = document.querySelector('.mantine-Loader-root');
      expect(loader).toBeInTheDocument();
    });

    expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
  });

  test('defaults to timeline tab when URL does not match any tab', async () => {
    setup(`/Patient/${HomerSimpson.id}/unknown-path`);

    await waitFor(() => {
      const timelineTab = screen.getByText('Timeline');
      expect(timelineTab).toBeInTheDocument();
      expect(timelineTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('renders homer summary information in sidebar', async () => {
    const patientSummarySpy = vi.spyOn(medplumReact, 'PatientSummary');
    setup(`/Patient/${HomerSimpson.id}`);

    await waitFor(() => {
      expect(patientSummarySpy).toHaveBeenCalled();
      expect(screen.getByText('Male')).toBeInTheDocument();
      expect(screen.getByText('1956-05-12 (069Y)')).toBeInTheDocument();
    });
  });

  test('handles empty pathname correctly', async () => {
    setup(`/Patient/${HomerSimpson.id}/`);

    await waitFor(() => {
      const timelineTab = screen.getByText('Timeline');
      expect(timelineTab).toBeInTheDocument();
      expect(timelineTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('highlights the Edit tab in a case-insensitive way even when /EDIT is used', async () => {
    setup(`/Patient/${HomerSimpson.id}/EDIT`);

    await waitFor(() => {
      const editTab = screen.getByText('Edit');
      expect(editTab).toBeInTheDocument();
      expect(editTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });
});
