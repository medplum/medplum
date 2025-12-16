// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { IntakeFormPage } from './IntakeFormPage';
import * as intakeFormUtils from '../../utils/intake-form';

describe('IntakeFormPage', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
    vi.spyOn(intakeFormUtils, 'onboardPatient');
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
      expect(screen.getByText('Patient Intake Questionnaire')).toBeInTheDocument();
    });
  });

  test('Renders required demographic fields', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Patient Intake Questionnaire')).toBeInTheDocument();
    });

    // Check for required fields - use getAllByRole and select first for fields that appear multiple times
    const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
    expect(firstNameInputs.length).toBeGreaterThan(0);
    expect(firstNameInputs[0]).toBeInTheDocument();

    const lastNameInputs = screen.getAllByRole('textbox', { name: /Last Name/i });
    expect(lastNameInputs.length).toBeGreaterThan(0);
    expect(lastNameInputs[0]).toBeInTheDocument();

    expect(screen.getByRole('textbox', { name: /Social Security Number/i })).toBeInTheDocument();
    const genderIdentityLabels = screen.getAllByText(/Gender Identity/i);
    expect(genderIdentityLabels.length).toBeGreaterThan(0);
  });

  test('Renders demographic group section', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Demographics')).toBeInTheDocument();
    });

    // Check for various demographic fields - use getAllByRole for fields that appear multiple times
    const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
    expect(firstNameInputs.length).toBeGreaterThan(0);

    const middleNameInputs = screen.getAllByRole('textbox', { name: /Middle Name/i });
    expect(middleNameInputs.length).toBeGreaterThan(0);

    const lastNameInputs = screen.getAllByRole('textbox', { name: /Last Name/i });
    expect(lastNameInputs.length).toBeGreaterThan(0);

    // Date of Birth appears multiple times (patient and related person)
    const dobInputs = screen.getAllByLabelText(/Date of Birth/i);
    expect(dobInputs.length).toBeGreaterThan(0);
    expect(screen.getByRole('textbox', { name: /Street/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /City/i })).toBeInTheDocument();
    // State field exists (rendered as searchbox/combobox)
    expect(screen.getByText(/State/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Zip/i })).toBeInTheDocument();
    // Phone appears multiple times (patient and emergency contact)
    const phoneInputs = screen.getAllByRole('textbox', { name: /Phone/i });
    expect(phoneInputs.length).toBeGreaterThan(0);
  });

  test('Can fill out text fields', async () => {
    const user = userEvent.setup();
    setup();

    await waitFor(() => {
      expect(screen.getByText('Patient Intake Questionnaire')).toBeInTheDocument();
    });

    // Use getAllByRole and select the first one (patient demographics)
    const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
    const lastNameInputs = screen.getAllByRole('textbox', { name: /Last Name/i });

    const firstNameInput = firstNameInputs[0];
    const lastNameInput = lastNameInputs[0];

    await user.type(firstNameInput, 'John');
    await user.type(lastNameInput, 'Doe');

    expect(firstNameInput).toHaveValue('John');
    expect(lastNameInput).toHaveValue('Doe');
  });

  test('Renders emergency contact section', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Emergency Contact')).toBeInTheDocument();
    });
  });

  test('Renders allergies section', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Allergies')).toBeInTheDocument();
    });
  });

  test('Renders medications section', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Current medications')).toBeInTheDocument();
    });
  });

  test('Renders medical history section', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText('Medical History')).toBeInTheDocument();
    });
  });
});
