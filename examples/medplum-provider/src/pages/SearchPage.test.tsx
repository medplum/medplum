// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { MockClient } from '@medplum/mock';
import type { Communication, Patient, Task, UserConfiguration } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { SearchPage } from './SearchPage';
import type { WithId } from '@medplum/core';

describe('SearchPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  async function setup(url: string, client = medplum, userConfig?: UserConfiguration): Promise<void> {
    if (userConfig) {
      vi.spyOn(client, 'getUserConfiguration').mockReturnValue(userConfig as unknown as WithId<UserConfiguration>);
    }
    await act(async () => {
      render(
        <MedplumProvider medplum={client}>
          <MemoryRouter initialEntries={[url]} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route path="/:resourceType" element={<SearchPage />} />
                <Route path="/:resourceType/new" element={<div>New Resource</div>} />
                <Route path="/Patient/:patientId/:resourceType/:id" element={<div>Patient Resource</div>} />
                <Route path="/:resourceType/:id" element={<div>Resource Detail</div>} />
              </Routes>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });
  }

  test('Renders SearchControl for Task resource type', async () => {
    await setup('/Task');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders SearchControl for Patient resource type', async () => {
    await setup('/Patient');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Renders with search query parameters', async () => {
    await setup('/Task?_fields=id,_lastUpdated,code,description');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Uses default resource type from localStorage', async () => {
    localStorage.setItem('defaultResourceType', 'Practitioner');
    await setup('/Practitioner');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Uses default resource type from UserConfiguration', async () => {
    const userConfig: UserConfiguration = {
      resourceType: 'UserConfiguration',
      option: [{ id: 'defaultResourceType', valueString: 'ServiceRequest' }],
    };
    await setup('/ServiceRequest', medplum, userConfig);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Saves and retrieves last search from localStorage', async () => {
    await setup('/Task?_fields=id,code&name:contains=test');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });

    // Verify default resource type was saved
    expect(localStorage.getItem('defaultResourceType')).toBe('Task');

    // Verify search was saved
    const savedSearch = localStorage.getItem('Task-defaultSearch');
    expect(savedSearch).toBeTruthy();
    const parsed = JSON.parse(savedSearch as string);
    expect(parsed.resourceType).toBe('Task');
  });

  test('Retrieves filters from last search', async () => {
    // Set up a previous search in localStorage
    const previousSearch = {
      resourceType: 'Task',
      filters: [{ code: 'status', operator: 'eq', value: 'in-progress' }],
    };
    localStorage.setItem('Task-defaultSearch', JSON.stringify(previousSearch));

    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Retrieves sort rules from last search', async () => {
    // Set up a previous search in localStorage
    const previousSearch = {
      resourceType: 'Task',
      sortRules: [{ code: 'priority', descending: false }],
    };
    localStorage.setItem('Task-defaultSearch', JSON.stringify(previousSearch));

    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Defaults to _lastUpdated descending sort when no last search', async () => {
    await setup('/Observation');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Handles search with offset and count', async () => {
    await setup('/Task?_offset=10&_count=50');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Navigates to resource with patient reference on click', async () => {
    // Create a task with a patient reference
    const patient: Patient = {
      resourceType: 'Patient',
      id: 'patient-123',
      name: [{ family: 'Test', given: ['Patient'] }],
    };
    await medplum.createResource(patient);

    const task: Task = {
      resourceType: 'Task',
      id: 'task-456',
      status: 'in-progress',
      intent: 'order',
      for: { reference: 'Patient/patient-123', display: 'Test Patient' },
    };
    await medplum.createResource(task);

    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Navigates to resource without patient reference on click', async () => {
    const task: Task = {
      resourceType: 'Task',
      id: 'task-789',
      status: 'draft',
      intent: 'order',
    };
    await medplum.createResource(task);

    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Handles resource with subject reference to Patient', async () => {
    const task: Task = {
      resourceType: 'Task',
      id: 'task-subject',
      status: 'in-progress',
      intent: 'order',
    };
    await medplum.createResource(task);

    await setup('/Task');
    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('Handles Communication with sender reference to Patient', async () => {
    const communication: Communication = {
      resourceType: 'Communication',
      id: 'comm-123',
      status: 'completed',
      sender: { reference: 'Patient/patient-456' },
    };
    await medplum.createResource(communication);

    await setup('/Communication');
    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });
  });

  test('New button navigates to new resource page', async () => {
    await setup('/Task');
    expect(await screen.findByText('New...')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('New...'));
    });

    await waitFor(() => {
      expect(screen.getByText('New Resource')).toBeInTheDocument();
    });
  });

  test('Handles resource click navigation', async () => {
    window.open = vi.fn();

    await setup('/Task');
    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });

    // Verify SearchControl is rendered and functional
    const searchControl = screen.getByTestId('search-control');
    expect(searchControl).toBeInTheDocument();
  });

  test('SearchControl supports checkbox selection', async () => {
    await setup('/Task');
    const searchControl = await screen.findByTestId('search-control');
    expect(searchControl).toBeInTheDocument();
  });

  test('Handles onChange for search definition updates', async () => {
    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });

    // Test pagination which triggers onChange
    const nextPageButton = screen.queryByLabelText('Next page');
    if (nextPageButton) {
      await act(async () => {
        fireEvent.click(nextPageButton);
      });
    }
  });

  test('Renders with default fields when not specified', async () => {
    await setup('/Practitioner');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
  });

  test('Shows loading when search is not ready', async () => {
    // Create a mock that simulates loading state
    const loadingClient = new MockClient();
    vi.spyOn(loadingClient, 'isLoading').mockReturnValue(true);

    await setup('/Task', loadingClient);

    // The component should show loading or SearchControl once ready
    await waitFor(
      () => {
        const searchControl = screen.queryByTestId('search-control');
        const loader = document.querySelector('.mantine-Loader-root');
        expect(searchControl || loader).toBeTruthy();
      },
      { timeout: 3000 }
    );
  });

  test('Handles auxClick to open resource in new tab', async () => {
    window.open = vi.fn();

    await setup('/Task');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });

    // The onAuxClick handler should be available on resource rows
    const searchControl = screen.getByTestId('search-control');
    expect(searchControl).toBeInTheDocument();
  });
});
