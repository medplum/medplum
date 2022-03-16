import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getDefaultFields, HomePage } from './HomePage';

function setup(url = '/Patient'): void {
  const medplum = new MockClient();
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={[url]} initialIndex={0}>
        <Routes>
          <Route path="/:resourceType/new" element={<div>Create Resource Page</div>} />
          <Route path="/:resourceType/:id" element={<div>Resource Page</div>} />
          <Route path="/:resourceType" element={<HomePage />} />
          <Route path="/" element={<HomePage />} />
        </Routes>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('HomePage', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('Renders default page', async () => {
    setup('/');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
  });

  test('Renders with resourceType', async () => {
    setup('/Patient');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
  });

  test('Renders with resourceType and fields', async () => {
    setup('/Patient?_fields=id,_lastUpdated,name,birthDate,gender');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    const control = screen.getByTestId('search-control');
    expect(control).toBeDefined();
  });

  test('Next page button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('next-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('next-page-button'));
    });
  });

  test('Prev page button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByTestId('prev-page-button'));
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('prev-page-button'));
    });
  });

  test('New button', async () => {
    setup();

    await act(async () => {
      await waitFor(() => screen.getByText('New...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });
  });

  test('Delete button, cancel', async () => {
    window.confirm = jest.fn(() => false);

    setup();

    await act(async () => {
      await waitFor(() => screen.getByText('Delete...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });
  });

  test('Delete button, ok', async () => {
    window.confirm = jest.fn(() => true);

    setup();

    await act(async () => {
      await waitFor(() => screen.getByText('Delete...'));
    });

    // Select all
    const checkboxes = screen.queryAllByTestId('row-checkbox');
    await act(async () => {
      checkboxes.forEach((checkbox) => fireEvent.click(checkbox));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Delete...'));
    });
  });

  test('Export button', async () => {
    // window.confirm = jest.fn(() => false);
    window.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/blob');
    window.open = jest.fn();

    setup();

    await act(async () => {
      await waitFor(() => screen.getByText('Export...'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Export...'));
    });

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(window.open).toHaveBeenCalled();
  });

  test('Default search fields', () => {
    expect(getDefaultFields('AccessPolicy')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('ClientApplication')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('CodeSystem')).toEqual(['id', '_lastUpdated', 'name', 'title', 'status']);
    expect(getDefaultFields('Condition')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'clinicalStatus']);
    expect(getDefaultFields('Device')).toEqual(['id', '_lastUpdated', 'manufacturer', 'deviceName', 'patient']);
    expect(getDefaultFields('DeviceDefinition')).toEqual(['id', '_lastUpdated', 'manufacturer[x]', 'deviceName']);
    expect(getDefaultFields('DeviceRequest')).toEqual(['id', '_lastUpdated', 'code[x]', 'subject']);
    expect(getDefaultFields('DiagnosticReport')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'status']);
    expect(getDefaultFields('Encounter')).toEqual(['id', '_lastUpdated', 'subject']);
    expect(getDefaultFields('Observation')).toEqual(['id', '_lastUpdated', 'subject', 'code', 'status']);
    expect(getDefaultFields('Organization')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Patient')).toEqual(['id', '_lastUpdated', 'name', 'birthDate', 'gender']);
    expect(getDefaultFields('Practitioner')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Project')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('Questionnaire')).toEqual(['id', '_lastUpdated', 'name']);
    expect(getDefaultFields('ServiceRequest')).toEqual([
      'id',
      '_lastUpdated',
      'subject',
      'code',
      'status',
      'orderDetail',
    ]);
    expect(getDefaultFields('Subscription')).toEqual(['id', '_lastUpdated', 'criteria']);
    expect(getDefaultFields('User')).toEqual(['id', '_lastUpdated', 'email']);
    expect(getDefaultFields('ValueSet')).toEqual(['id', '_lastUpdated', 'name', 'title', 'status']);
  });

  test('Left click on row', async () => {
    window.open = jest.fn();

    setup('/Patient');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'));
    });

    // Change the tab
    expect(screen.getByText('Resource Page')).toBeInTheDocument();

    // Do not open a new browser tab
    expect(window.open).not.toHaveBeenCalled();
  });

  test('Middle click on row', async () => {
    window.open = jest.fn();

    setup('/Patient');

    await act(async () => {
      await waitFor(() => screen.getByTestId('search-control'));
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Homer Simpson'), { button: 1 });
    });

    // Should open a new browser tab
    expect(window.open).toHaveBeenCalledWith('/Patient/123', '_blank');

    // Should still be on the home page
    expect(screen.getByTestId('search-control')).toBeInTheDocument();
  });
});
