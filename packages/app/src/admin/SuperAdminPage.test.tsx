import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { toast } from 'react-toastify';
import { SuperAdminPage } from './SuperAdminPage';

const medplum = new MockClient();

function setup(): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={['/admin/super']} initialIndex={0}>
        <Routes>
          <Route path="/admin/super" element={<SuperAdminPage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('SuperAdminPage', () => {
  test('Rebuild StructureDefinitions', async () => {
    toast.success = jest.fn();

    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild StructureDefinitions'));
    });

    expect(toast.success).toHaveBeenCalledWith('Done');
  });

  test('Rebuild SearchParameters', async () => {
    toast.success = jest.fn();

    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild SearchParameters'));
    });

    expect(toast.success).toHaveBeenCalledWith('Done');
  });

  test('Rebuild ValueSets', async () => {
    toast.success = jest.fn();

    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild ValueSets'));
    });

    expect(toast.success).toHaveBeenCalledWith('Done');
  });

  test('Reindex resource type', async () => {
    toast.success = jest.fn();

    setup();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    expect(toast.success).toHaveBeenCalledWith('Done');
  });
});
