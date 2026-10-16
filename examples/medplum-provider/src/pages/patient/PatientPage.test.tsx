// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { calculateAgeString } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import * as medplumReact from '@medplum/react';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { EditTab } from './EditTab';
import { PatientPage } from './PatientPage';
import { TimelineTab } from './TimelineTab';

describe('PatientPage', () => {
  let medplum: MockClient;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (initialPath = '/Patient/patient-123'): ReturnType<typeof render> => {
    window.history.pushState({}, '', initialPath);
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
    expect(screen.getByText('Visits')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Meds')).toBeInTheDocument();
  });

  test('does not render an Edit tab (profile editing moved to the summary header menu)', async () => {
    setup(`/Patient/${HomerSimpson.id}`);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    expect(screen.queryByText('Edit')).not.toBeInTheDocument();
  });

  test('sets initial tab from URL path', async () => {
    setup(`/Patient/${HomerSimpson.id}/DocumentReference`);

    await waitFor(() => {
      const documentsTab = screen.getByText('Documents');
      expect(documentsTab).toBeInTheDocument();
      expect(documentsTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('handles tab change when clicking on tab', async () => {
    const user = userEvent.setup();
    setup(`/Patient/${HomerSimpson.id}`);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Documents'));

    await waitFor(() => {
      const documentsTab = screen.getByText('Documents');
      expect(documentsTab).toBeInTheDocument();
      expect(documentsTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
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

    if (!HomerSimpson.birthDate) {
      throw new Error('Test data in unexpected state - homer has no birthdate');
    }

    const age = calculateAgeString(HomerSimpson.birthDate);

    await waitFor(() => {
      expect(patientSummarySpy).toHaveBeenCalled();
    });
    expect(await screen.findByText('Male')).toBeInTheDocument();
    expect(await screen.findByText(`1956-05-12 (${age})`)).toBeInTheDocument();
  });

  test('handles empty pathname correctly', async () => {
    setup(`/Patient/${HomerSimpson.id}/`);

    await waitFor(() => {
      const timelineTab = screen.getByText('Timeline');
      expect(timelineTab).toBeInTheDocument();
      expect(timelineTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });

  test('highlights the matching tab in a case-insensitive way even when the path case differs', async () => {
    setup(`/Patient/${HomerSimpson.id}/DOCUMENTREFERENCE`);

    await waitFor(() => {
      const documentsTab = screen.getByText('Documents');
      expect(documentsTab).toBeInTheDocument();
      expect(documentsTab.closest('[role="tab"]')).toHaveAttribute('aria-selected', 'true');
    });
  });
});
