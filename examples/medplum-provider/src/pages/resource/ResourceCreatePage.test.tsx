// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ResourceCreatePage } from './ResourceCreatePage';

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
