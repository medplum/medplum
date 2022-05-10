import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EditMembershipPage } from './EditMembershipPage';

let medplum = new MockClient();

async function setup(url: string): Promise<void> {
  await act(async () => {
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={[url]} initialIndex={0}>
          <Routes>
            <Route path="/admin/projects/:projectId/members/:membershipId" element={<EditMembershipPage />} />
          </Routes>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

describe('EditMembershipPage', () => {
  beforeEach(() => {
    medplum = new MockClient();

    jest.useFakeTimers();
  });

  afterEach(async () => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('Renders', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();
  });

  test('Submit success', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with access policy', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();

    // There are 2 autocompletes.  Access policy is the first.
    const input = screen.getAllByTestId('input-element')[0] as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example Access Policy' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with user configuration', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();

    // There are 2 autocompletes.  User configuration is the second.
    const input = screen.getAllByTestId('input-element')[1] as HTMLInputElement;

    // Enter "Example Access Policy"
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Example User Configuration' } });
    });

    // Wait for the drop down
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    await waitFor(() => screen.getByTestId('dropdown'));

    // Press "Enter"
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Submit with admin', async () => {
    const medplumPostSpy = jest.spyOn(medplum, 'post');

    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();

    const input = screen.getByTestId('admin-checkbox') as HTMLInputElement;

    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();

    expect(medplumPostSpy).toHaveBeenCalledWith(
      `admin/projects/123/members/456`,
      expect.objectContaining({
        admin: true,
      })
    );
  });

  test('Remove admin', async () => {
    const medplumPostSpy = jest.spyOn(medplum, 'post');

    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeInTheDocument();

    const input = screen.getByTestId('admin-checkbox') as HTMLInputElement;

    // Click once to set admin
    await act(async () => {
      fireEvent.click(input);
    });

    // Click again to remove admin
    await act(async () => {
      fireEvent.click(input);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();

    expect(medplumPostSpy).toHaveBeenCalledWith(
      `admin/projects/123/members/456`,
      expect.objectContaining({
        admin: false,
      })
    );
  });

  test('Remove user accept confirm', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Remove user')).toBeInTheDocument();

    await act(async () => {
      window.confirm = jest.fn(() => true);
      fireEvent.click(screen.getByText('Remove user'));
    });

    expect(screen.getByTestId('success')).toBeInTheDocument();
  });

  test('Remove user reject confirm', async () => {
    await setup('/admin/projects/123/members/456');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Remove user')).toBeInTheDocument();

    await act(async () => {
      window.confirm = jest.fn(() => false);
      fireEvent.click(screen.getByText('Remove user'));
    });

    expect(screen.queryByTestId('success')).toBeNull();
  });
});
