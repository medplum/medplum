import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import { AppRoutes } from '../AppRoutes';

const medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <AppRoutes />
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('SitesPage', () => {
  beforeAll(() => {
    medplum.setActiveLoginOverride({
      accessToken: '123',
      refreshToken: '456',
      profile: {
        reference: 'Practitioner/123',
      },
      project: {
        reference: 'Project/123',
      },
    });
  });

  test('Renders', async () => {
    await setup('/admin/sites');
    await waitFor(() => screen.getByText('Project Sites'));
    expect(screen.getByText('Project Sites')).toBeInTheDocument();
  });

  test('Add and submit', async () => {
    toast.success = jest.fn();

    await setup('/admin/sites');
    await waitFor(() => screen.getByTitle('Add'));

    // Click the "Add" button
    await act(async () => {
      fireEvent.click(screen.getByTitle('Add'));
    });

    // Enter the site name
    await act(async () => {
      fireEvent.change(screen.getByTestId('name'), { target: { value: 'foo' } });
    });

    // Click the "Save" button
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    // Wait for the toast
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Saved'));
  });
});
