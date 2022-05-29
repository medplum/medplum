import { Practitioner } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ResourcePage } from './ResourcePage';

let medplum: MockClient;

describe('ResourcePage', () => {
  async function setup(url: string): Promise<void> {
    medplum = new MockClient();
    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <Routes>
              <Route path="/:resourceType/:id/:tab" element={<ResourcePage />} />
              <Route path="/:resourceType/:id" element={<ResourcePage />} />
              <Route path="/:resourceType" element={<HomePage />} />
            </Routes>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Not found', async () => {
    await setup('/Practitioner/not-found');
    await waitFor(() => screen.getByText('Resource not found'));
    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Details tab renders', async () => {
    await setup('/Practitioner/123');
    await waitFor(() => screen.queryAllByText('Name'));
    expect(screen.queryAllByText('Name')[0]).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Edit tab renders', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Edit'));
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Delete button on edit page', async () => {
    await setup('/Practitioner/123/edit');
    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    await waitFor(() => screen.getByText('Are you sure you want to delete this Practitioner?'));
    expect(screen.getByText('Are you sure you want to delete this Practitioner?')).toBeInTheDocument();
  });

  test('Delete button confirm', async () => {
    // Create a practitioner that we can delete
    const practitioner = await medplum.createResource<Practitioner>({
      resourceType: 'Practitioner',
    });

    await setup(`/Practitioner/${practitioner.id}/delete`);
    await waitFor(() => screen.getByText('Delete'));
    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    const check = await medplum.readResource('Practitioner', practitioner.id as string);
    expect(check).toBeUndefined();
  });

  test('History tab renders', async () => {
    await setup('/Practitioner/123/history');
    await waitFor(() => screen.getByText('History'));

    expect(screen.getByText('History')).toBeInTheDocument();
  });

  test('Blame tab renders', async () => {
    await setup('/Practitioner/123/blame');
    await waitFor(() => screen.getByText('Blame'));

    expect(screen.getByText('Blame')).toBeInTheDocument();
  });

  test('JSON tab renders', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: { value: '{"resourceType":"Practitioner","id":"123"}' },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit with meta', async () => {
    await setup('/Practitioner/123/json');
    await waitFor(() => screen.getByTestId('resource-json'));

    await act(async () => {
      fireEvent.change(screen.getByTestId('resource-json'), {
        target: {
          value: JSON.stringify({
            resourceType: 'Practitioner',
            id: '123',
            meta: {
              lastUpdated: '2020-01-01T00:00:00.000Z',
              author: {
                reference: 'Practitioner/111',
              },
            },
          }),
        },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('OK'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('Patient timeline', async () => {
    await setup('/Patient/123/timeline');
    await waitFor(() => screen.getByText('Timeline'));

    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Expect identifiers
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Patient apps', async () => {
    await setup('/Patient/123/apps');
    await waitFor(() => screen.getByText('Apps'));

    expect(screen.getByText('Apps')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Encounter timeline', async () => {
    await setup('/Encounter/123/timeline');
    await waitFor(() => screen.getByText('Timeline'));

    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    await setup('/Questionnaire/123/builder');
    await waitFor(() => screen.getByText('Save'));

    expect(screen.getByText('Save')).toBeDefined();
  });

  test('Questionnaire preview', async () => {
    await setup('/Questionnaire/123/preview');
    await waitFor(() => screen.getByText('Preview'));

    expect(screen.getByText('Preview')).toBeInTheDocument();

    window.alert = jest.fn();
    fireEvent.click(screen.getByText('OK'));
    expect(window.alert).toHaveBeenCalledWith('You submitted the preview');
  });

  test('Bot editor', async () => {
    await setup('/Bot/123/editor');
    await waitFor(() => screen.getByText('Editor'));

    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  test('DiagnosticReport display', async () => {
    await setup('/DiagnosticReport/123/report');
    await waitFor(() => screen.getByText('Report'));

    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  test('Left click on tab', async () => {
    window.open = jest.fn();

    await setup('/Practitioner/123');
    await waitFor(() => screen.getByText('Name'));

    await act(async () => {
      fireEvent.click(screen.getByText('History'));
    });

    // Change the tab
    expect(screen.getByText('History')).toHaveClass('selected');

    // Do not open a new browser tab
    expect(window.open).not.toHaveBeenCalled();
  });

  test('Middle click on tab', async () => {
    window.open = jest.fn();

    await setup('/Practitioner/123');
    await waitFor(() => screen.getByText('Name'));

    await act(async () => {
      fireEvent.click(screen.getByText('History'), { button: 1 });
    });

    // Should not change the tab
    expect(screen.getByText('Details')).toHaveClass('selected');
    expect(screen.getByText('History')).not.toHaveClass('selected');

    // Should open a new browser tab
    expect(window.open).toHaveBeenCalledWith('/Practitioner/123/history', '_blank');
  });
});
