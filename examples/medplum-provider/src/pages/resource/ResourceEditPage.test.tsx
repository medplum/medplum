// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import * as reactRouter from 'react-router';
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { ResourceEditPage } from './ResourceEditPage';

describe('ResourceEditPage', () => {
  let medplum: MockClient;
  let navigateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
    navigateSpy = vi.fn();
    vi.spyOn(reactRouter, 'useNavigate').mockReturnValue(navigateSpy as any);
  });

  const setup = (url: string): ReturnType<typeof render> => {
    return render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <MantineProvider>
            <Notifications />
            <Routes>
              <Route path="/:resourceType/:id/edit" element={<ResourceEditPage />} />
            </Routes>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  };

  test('Renders edit page', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    setup(`/Practitioner/${practitioner.id}/edit`);

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /update|save|submit/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  test('Loads resource data', async () => {
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test', given: ['John'] }],
    });

    const readResourceSpy = vi.spyOn(medplum, 'readResource');
    setup(`/Practitioner/${practitioner.id}/edit`);

    await waitFor(() => {
      expect(readResourceSpy).toHaveBeenCalledWith('Practitioner', practitioner.id);
    });
  });

  test('Submit updates resource', async () => {
    const user = userEvent.setup();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    setup(`/Practitioner/${practitioner.id}/edit`);

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /update|save|submit/i });
      expect(submitButton).toBeInTheDocument();
    });

    const updateButton = screen.getByRole('button', { name: /update|save|submit/i });
    vi.spyOn(medplum, 'updateResource').mockResolvedValue(practitioner as any);

    await user.click(updateButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(navigateSpy).toHaveBeenCalledWith('..');
    });
  });

  test('Handles update error', async () => {
    const user = userEvent.setup();
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
      name: [{ family: 'Test' }],
    });

    setup(`/Practitioner/${practitioner.id}/edit`);

    await waitFor(() => {
      const submitButton = screen.getByRole('button', { name: /update|save|submit/i });
      expect(submitButton).toBeInTheDocument();
    });

    const updateButton = screen.getByRole('button', { name: /update|save|submit/i });
    const error = new Error('Failed to update resource');
    vi.spyOn(medplum, 'updateResource').mockRejectedValue(error);

    await user.click(updateButton);

    await waitFor(() => {
      expect(medplum.updateResource).toHaveBeenCalled();
      expect(screen.getByText(/failed to update resource/i)).toBeInTheDocument();
    });
  });

  test('Handles load error', async () => {
    vi.spyOn(medplum, 'readResource').mockRejectedValue(new Error('Resource not found'));

    setup('/Practitioner/non-existent/edit');

    await waitFor(() => {
      expect(medplum.readResource).toHaveBeenCalled();
      expect(screen.getByText(/resource not found/i)).toBeInTheDocument();
    });
  });
});
