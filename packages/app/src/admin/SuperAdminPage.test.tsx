import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { SuperAdminPage } from './SuperAdminPage';

const medplum = new MockClient();

function setup() {
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
    window.alert = jest.fn();

    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild StructureDefinitions'));
    });

    expect(window.alert).toHaveBeenCalledWith('Done');
  });

  test('Rebuild ValueSets', async () => {
    window.alert = jest.fn();

    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild ValueSets'));
    });

    expect(window.alert).toHaveBeenCalledWith('Done');
  });

  test('Reindex resource type', async () => {
    window.alert = jest.fn();

    setup();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    expect(window.alert).toHaveBeenCalledWith('Done');
  });
});
