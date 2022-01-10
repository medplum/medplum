import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/ui';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './HomePage';
import { ResourcePage } from './ResourcePage';

const medplum = new MockClient();

describe('ResourcePage', () => {
  function setup(url: string): void {
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
  }

  test('Not found', async () => {
    setup('/Practitioner/not-found');

    await act(async () => {
      await waitFor(() => screen.getByText('Resource not found'));
    });

    expect(screen.getByText('Resource not found')).toBeInTheDocument();
  });

  test('Details tab renders', async () => {
    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.queryAllByText('Name'));
    });

    expect(screen.queryAllByText('Name')[0]).toBeInTheDocument();
    expect(screen.getByText('Gender')).toBeInTheDocument();
  });

  test('Edit tab renders', async () => {
    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Edit'));
    });

    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  test('Delete button confirm', async () => {
    window.confirm = jest.fn(() => true);

    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Delete'));
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  test('Delete button decline', async () => {
    window.confirm = jest.fn(() => false);

    setup('/Practitioner/123/edit');

    await act(async () => {
      await waitFor(() => screen.getByText('Delete'));
    });

    expect(screen.getByText('Delete')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Delete'));
    });

    expect(window.confirm).toHaveBeenCalled();
  });

  test('History tab renders', async () => {
    setup('/Practitioner/123/history');

    await act(async () => {
      await waitFor(() => screen.getByText('History'));
    });

    expect(screen.getByText('History')).toBeInTheDocument();
  });

  test('Blame tab renders', async () => {
    setup('/Practitioner/123/blame');

    await act(async () => {
      await waitFor(() => screen.getByText('Blame'));
    });

    expect(screen.getByText('Blame')).toBeInTheDocument();
  });

  test('JSON tab renders', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

    expect(screen.getByTestId('resource-json')).toBeInTheDocument();
  });

  test('JSON submit', async () => {
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

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
    setup('/Practitioner/123/json');

    await act(async () => {
      await waitFor(() => screen.getByTestId('resource-json'));
    });

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
    setup('/Patient/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).toBeInTheDocument();

    // Expect identifiers
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
    expect(screen.getByText('def')).toBeInTheDocument();
    expect(screen.getByText('456')).toBeInTheDocument();
  });

  test('Patient apps', async () => {
    setup('/Patient/123/apps');

    await act(async () => {
      await waitFor(() => screen.getByText('Apps'));
    });

    expect(screen.getByText('Apps')).toBeInTheDocument();
    expect(screen.getByText('Vitals')).toBeInTheDocument();
  });

  test('Encounter timeline', async () => {
    setup('/Encounter/123/timeline');

    await act(async () => {
      await waitFor(() => screen.getByText('Timeline'));
    });

    expect(screen.getByText('Timeline')).toBeInTheDocument();
  });

  test('Questionnaire builder', async () => {
    setup('/Questionnaire/123/builder');

    await act(async () => {
      await waitFor(() => screen.getByText('Save'));
    });

    expect(screen.getByText('Save')).toBeDefined();
  });

  test('Questionnaire preview', async () => {
    setup('/Questionnaire/123/preview');

    await act(async () => {
      await waitFor(() => screen.getByText('Preview'));
    });

    expect(screen.getByText('Preview')).toBeInTheDocument();

    window.alert = jest.fn();
    fireEvent.click(screen.getByText('OK'));
    expect(window.alert).toHaveBeenCalledWith('You submitted the preview');
  });

  test('Bot editor', async () => {
    setup('/Bot/123/editor');

    await act(async () => {
      await waitFor(() => screen.getByText('Editor'));
    });

    expect(screen.getByText('Editor')).toBeInTheDocument();
  });

  test('DiagnosticReport display', async () => {
    setup('/DiagnosticReport/123/report');

    await act(async () => {
      await waitFor(() => screen.getByText('Report'));
    });

    expect(screen.getByText('Report')).toBeInTheDocument();
  });

  test('Left click on tab', async () => {
    window.open = jest.fn();

    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

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

    setup('/Practitioner/123');

    await act(async () => {
      await waitFor(() => screen.getByText('Name'));
    });

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
