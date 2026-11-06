// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { badRequest, notFound, OperationOutcomeError, serverError } from '@medplum/core';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as reactRouter from 'react-router';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ResourceCreatePage } from './ResourceCreatePage';

const US_CORE_PATIENT = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';

// What a Medplum server actually returns when the profile is not installed: `$expand-profile`
// reports it as a 400, not a 404.
const profileNotInstalled = new OperationOutcomeError(
  badRequest(`StructureDefinition profile with URL ${US_CORE_PATIENT} not found`)
);

describe('ResourceCreatePage', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
  });

  const setup = async (url: string): Promise<void> => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[url]}>
          <MedplumProvider medplum={medplum}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route path="/:resourceType/new" element={<ResourceCreatePage />} />
                <Route path="/Patient/:patientId/:resourceType/new" element={<ResourceCreatePage />} />
              </Routes>
            </MantineProvider>
          </MedplumProvider>
        </MemoryRouter>
      );
    });
  };

  test('Renders new Practitioner form page', async () => {
    await setup('/Practitioner/new');

    await waitFor(() => {
      expect(screen.getByText('New Practitioner')).toBeInTheDocument();
    });
  });

  test('Renders new Task form page', async () => {
    await setup('/Task/new');

    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });
  });

  test('Form submit creates new Practitioner', async () => {
    const user = userEvent.setup();
    await setup('/Practitioner/new');

    await waitFor(() => {
      expect(screen.getByText('New Practitioner')).toBeInTheDocument();
    });

    // Find the submit button (ResourceForm typically has a "Create" or "OK" button)
    const submitButton = await screen.findByRole('button', { name: /create|ok|submit/i });
    expect(submitButton).toBeInTheDocument();

    // Mock createResource to return a result
    const createdPractitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-123',
    };
    vi.spyOn(medplum, 'createResource').mockResolvedValue(createdPractitioner as any);

    await user.click(submitButton);

    await waitFor(() => {
      expect(medplum.createResource).toHaveBeenCalled();
    });
  });

  test('Form submit creates new Task and navigates', async () => {
    const user = userEvent.setup();
    await setup('/Task/new');

    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });

    const submitButton = await screen.findByRole('button', { name: /create|ok|submit/i });
    expect(submitButton).toBeInTheDocument();

    const createdTask = {
      resourceType: 'Task',
      id: 'task-123',
    };
    vi.spyOn(medplum, 'createResource').mockResolvedValue(createdTask as any);

    await user.click(submitButton);

    await waitFor(
      () => {
        expect(medplum.createResource).toHaveBeenCalled();
        expect(navigateSpy).toHaveBeenCalledWith('/Task/task-123');
      },
      { timeout: 3000 }
    );
  });

  test('Form submit creates new Task with patient context and navigates', async () => {
    const user = userEvent.setup();
    await setup(`/Patient/${HomerSimpson.id}/Task/new`);

    await waitFor(() => {
      expect(screen.getByText('New Task')).toBeInTheDocument();
    });

    const submitButton = await screen.findByRole('button', { name: /create|ok|submit/i });
    expect(submitButton).toBeInTheDocument();

    const createdTask = {
      resourceType: 'Task',
      id: 'task-123',
    };
    vi.spyOn(medplum, 'createResource').mockResolvedValue(createdTask as any);

    await user.click(submitButton);

    await waitFor(
      () => {
        expect(medplum.createResource).toHaveBeenCalled();
        // Should navigate with patient path prepended - check that navigate was called
        expect(navigateSpy).toHaveBeenCalled();
        // The path should include the patient ID
        const navigateCalls = navigateSpy.mock.calls;
        expect(navigateCalls.length).toBeGreaterThan(0);
        const lastCall = navigateCalls[navigateCalls.length - 1][0];
        expect(String(lastCall)).toContain(`Patient/${HomerSimpson.id}`);
        expect(String(lastCall)).toContain('Task/task-123');
      },
      { timeout: 3000 }
    );
  });

  test('Shows friendly admin guidance when a required profile is missing', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'requestProfileSchema').mockRejectedValue(profileNotInstalled);

    await setup('/Patient/new');

    await waitFor(() => {
      expect(screen.getByText(/Creating a Patient requires/i)).toBeInTheDocument();
    });

    // Admins see the specific profile URL and a docs link...
    expect(screen.getByText(US_CORE_PATIENT)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /profiles documentation/i })).toBeInTheDocument();
    // ...and the raw server-error string is no longer shown.
    expect(screen.queryByText(/Server error:/i)).not.toBeInTheDocument();
  });

  test('Directs non-admins to an administrator when a required profile is missing', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(false);
    vi.spyOn(medplum, 'requestProfileSchema').mockRejectedValue(profileNotInstalled);

    await setup('/Patient/new');

    await waitFor(() => {
      expect(screen.getByText(/Contact your administrator/i)).toBeInTheDocument();
    });

    // The specific profile URL is only shown to admins.
    expect(screen.queryByText(US_CORE_PATIENT)).not.toBeInTheDocument();
    expect(screen.queryByText(/Server error:/i)).not.toBeInTheDocument();
  });

  test('Treats a 404 as a missing profile too', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'requestProfileSchema').mockRejectedValue(new OperationOutcomeError(notFound));

    await setup('/Patient/new');

    await waitFor(() => {
      expect(screen.getByText(/Creating a Patient requires/i)).toBeInTheDocument();
    });
  });

  test('Surfaces the real error on a 5xx instead of missing-profile guidance', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    vi.spyOn(medplum, 'requestProfileSchema').mockRejectedValue(
      new OperationOutcomeError(serverError(new Error('Internal server error')))
    );

    await setup('/Patient/new');

    // The real error is surfaced...
    await waitFor(() => {
      expect(screen.getByText(/Server error: Internal server error/i)).toBeInTheDocument();
    });

    // ...and the admin is not misdirected to install a profile that may already be present.
    expect(screen.queryByText(/Creating a Patient requires/i)).not.toBeInTheDocument();
  });

  test('Surfaces the real error on a network failure instead of missing-profile guidance', async () => {
    vi.spyOn(medplum, 'isProjectAdmin').mockReturnValue(true);
    // A bare Error (fetch failure, timeout) says nothing about whether the profile exists.
    vi.spyOn(medplum, 'requestProfileSchema').mockRejectedValue(new Error('Failed to fetch'));

    await setup('/Patient/new');

    await waitFor(() => {
      expect(screen.getByText(/Server error: Failed to fetch/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Creating a Patient requires/i)).not.toBeInTheDocument();
  });

  test('Handles form submission error', async () => {
    const user = userEvent.setup();
    await setup('/Practitioner/new');

    await waitFor(() => {
      expect(screen.getByText('New Practitioner')).toBeInTheDocument();
    });

    const submitButton = await screen.findByRole('button', { name: /create|ok|submit/i });
    expect(submitButton).toBeInTheDocument();

    const error = new Error('Failed to create resource');
    vi.spyOn(medplum, 'createResource').mockRejectedValue(error);

    await user.click(submitButton);

    await waitFor(() => {
      expect(medplum.createResource).toHaveBeenCalled();
      // Should show error notification
      expect(screen.getByText(/failed to create resource/i)).toBeInTheDocument();
    });
  });
});
