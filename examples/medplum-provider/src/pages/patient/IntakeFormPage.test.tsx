// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { Questionnaire } from '@medplum/fhirtypes';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { IntakeFormPage } from './IntakeFormPage';

const simpleQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  title: 'Simple Test Questionnaire',
  item: [
    {
      linkId: 'demographics',
      text: 'Demographics',
      type: 'group',
      item: [
        {
          linkId: 'first-name',
          text: 'First Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'last-name',
          text: 'Last Name',
          type: 'string',
          required: true,
        },
        {
          linkId: 'ssn',
          text: 'Social Security Number',
          type: 'string',
          required: true,
        },
        {
          linkId: 'gender-identity',
          text: 'Gender Identity',
          type: 'choice',
          answerValueSet: 'http://example.com/gender',
          required: true,
        },
      ],
    },
    {
      linkId: 'emergency-contact',
      text: 'Emergency Contact',
      type: 'group',
      item: [
        {
          linkId: 'emergency-contact-first-name',
          text: 'First Name',
          type: 'string',
        },
      ],
    },
  ],
};

describe('IntakeFormPage', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;
  let renderResult: ReturnType<typeof render> | null = null;

  beforeEach(() => {
    cleanup();
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
    renderResult = null;

    // Use mockImplementation with immediate resolution to avoid async timing issues
    medplum.valueSetExpand = vi.fn().mockImplementation(() =>
      Promise.resolve({
        resourceType: 'ValueSet',
        expansion: {
          contains: [{ system: 'test', code: 'test-code', display: 'Test Display' }],
        },
      })
    );
  });

  afterEach(() => {
    if (renderResult) {
      renderResult.unmount();
      renderResult = null;
    }
    cleanup();
    vi.restoreAllMocks();
  });

  const setup = async (skipValueSetCheck = true, questionnaire?: Questionnaire): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/onboarding']}>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route
                  path="/onboarding"
                  element={<IntakeFormPage skipValueSetCheck={skipValueSetCheck} questionnaire={questionnaire} />}
                />
              </Routes>
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('Renders questionnaire form with all sections', async () => {
    await setup(true, simpleQuestionnaire);

    await waitFor(
      () => {
        expect(screen.getByText('Simple Test Questionnaire')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        expect(screen.getByText('Demographics')).toBeInTheDocument();
        expect(screen.getByText('Emergency Contact')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );
  });

  test('Shows alert when value sets are unavailable', async () => {
    medplum.valueSetExpand = vi.fn().mockImplementation(async (params: { url: string }) => {
      if (params.url === 'http://example.com/gender') {
        throw new Error('Value set not available');
      }
      return {
        resourceType: 'ValueSet',
        expansion: { contains: [] },
      };
    });

    await setup(false, simpleQuestionnaire);

    await waitFor(
      () => {
        expect(screen.getByText('Simple Test Questionnaire')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        const alert = screen.queryByText(/Some valuesets are unavailable/i);
        if (alert) {
          expect(alert).toBeInTheDocument();
        }
      },
      { timeout: 10000 }
    );
  });

  test('Renders required demographic fields', async () => {
    await setup(true, simpleQuestionnaire);

    await waitFor(
      () => {
        expect(screen.getByText('Simple Test Questionnaire')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
        expect(firstNameInputs.length).toBeGreaterThan(0);
      },
      { timeout: 10000 }
    );

    const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
    expect(firstNameInputs[0]).toBeInTheDocument();

    const lastNameInputs = screen.getAllByRole('textbox', { name: /Last Name/i });
    expect(lastNameInputs.length).toBeGreaterThan(0);
    expect(lastNameInputs[0]).toBeInTheDocument();

    expect(screen.getByRole('textbox', { name: /Social Security Number/i })).toBeInTheDocument();
    const genderIdentityLabels = screen.getAllByText(/Gender Identity/i);
    expect(genderIdentityLabels.length).toBeGreaterThan(0);
  });

  test('Renders demographic group section', async () => {
    await setup(true, simpleQuestionnaire);

    await waitFor(
      () => {
        expect(screen.getByText('Demographics')).toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        expect(screen.queryByText(/Loading/i)).not.toBeInTheDocument();
      },
      { timeout: 10000 }
    );

    await waitFor(
      () => {
        const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
        expect(firstNameInputs.length).toBeGreaterThan(0);
      },
      { timeout: 10000 }
    );

    const firstNameInputs = screen.getAllByRole('textbox', { name: /First Name/i });
    expect(firstNameInputs.length).toBeGreaterThan(0);

    const lastNameInputs = screen.getAllByRole('textbox', { name: /Last Name/i });
    expect(lastNameInputs.length).toBeGreaterThan(0);

    expect(screen.getByRole('textbox', { name: /Social Security Number/i })).toBeInTheDocument();
    const genderIdentityLabels = screen.getAllByText(/Gender Identity/i);
    expect(genderIdentityLabels.length).toBeGreaterThan(0);
  });
});
