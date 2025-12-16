// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { IntakeFormPage } from './IntakeFormPage';

// Mock onboardPatient
vi.mock('../../utils/intake-form', () => ({
  onboardPatient: vi.fn(),
}));

describe('IntakeFormPage', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
  });

  const setup = (): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/onboarding" element={<IntakeFormPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders QuestionnaireForm', async () => {
    setup();

    await waitFor(() => {
      // QuestionnaireForm should render - look for form elements
      // The questionnaire title should be visible
      expect(screen.getByText('Patient Intake Questionnaire')).toBeInTheDocument();
    });
  });

  test('Renders questionnaire form', async () => {
    setup();

    await waitFor(() => {
      // Verify the form renders by checking for the questionnaire title
      expect(screen.getByText('Patient Intake Questionnaire')).toBeInTheDocument();
    });
  });
});

