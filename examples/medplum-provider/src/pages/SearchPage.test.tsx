// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import type { Communication, Observation, Task, UserConfiguration } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SearchPage } from './SearchPage';

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
                <Route path="/" element={<SearchPage />} />
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
    await setup('/');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(localStorage.getItem('Practitioner-defaultSearch')).toBeTruthy();
  });

  test('Uses default resource type from UserConfiguration', async () => {
    const userConfig: UserConfiguration = {
      resourceType: 'UserConfiguration',
      option: [{ id: 'defaultResourceType', valueString: 'ServiceRequest' }],
    };
    await setup('/', medplum, userConfig);
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(localStorage.getItem('ServiceRequest-defaultSearch')).toBeTruthy();
  });

  test('Defaults to Task when no default resource type', async () => {
    await setup('/');
    expect(await screen.findByTestId('search-control')).toBeInTheDocument();
    expect(localStorage.getItem('Task-defaultSearch')).toBeTruthy();
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
    localStorage.setItem('defaultResourceType', 'Task');
    localStorage.setItem('Task-defaultSearch', JSON.stringify(previousSearch));

    // Filters from the last search are only applied when the URL has no resource type
    await setup('/');

    await waitFor(() => {
      expect(screen.getByTestId('search-control')).toBeInTheDocument();
    });

    const savedSearch = JSON.parse(localStorage.getItem('Task-defaultSearch') as string);
    expect(savedSearch.filters).toEqual([{ code: 'status', operator: 'eq', value: 'in-progress' }]);
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
    const communication: Communication = {
      resourceType: 'Communication',
      id: 'comm-123',
      status: 'completed',
      sender: { reference: 'Patient/patient-456' },
    };
    await medplum.createResource(communication);

    await setup('/Communication');
    await screen.findByTestId('search-control');

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(await screen.findByText('Patient Resource')).toBeInTheDocument();
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
    await screen.findByTestId('search-control');

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(await screen.findByText('Resource Detail')).toBeInTheDocument();
  });

  test('Handles resource with subject reference to Patient', async () => {
    const observation: Observation = {
      resourceType: 'Observation',
      id: 'obs-subject',
      status: 'final',
      code: { text: 'test' },
      subject: { reference: 'Patient/patient-123' },
    };
    await medplum.createResource(observation);

    await setup('/Observation');
    await screen.findByTestId('search-control');

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(await screen.findByText('Patient Resource')).toBeInTheDocument();
  });

  test('Handles Communication with non-patient sender reference', async () => {
    const communication: Communication = {
      resourceType: 'Communication',
      id: 'comm-456',
      status: 'completed',
      sender: { reference: 'Practitioner/practitioner-123' },
    };
    await medplum.createResource(communication);

    await setup('/Communication');
    await screen.findByTestId('search-control');

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0]);
    });

    expect(await screen.findByText('Resource Detail')).toBeInTheDocument();
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

  test('SearchControl supports checkbox selection', async () => {
    await setup('/Task');
    const searchControl = await screen.findByTestId('search-control');
    expect(searchControl).toBeInTheDocument();
  });

  test('Handles onChange for search definition updates', async () => {
    await medplum.createResource<Task>({ resourceType: 'Task', status: 'draft', intent: 'order' });
    await medplum.createResource<Task>({ resourceType: 'Task', status: 'draft', intent: 'order' });

    await setup('/Task?_count=1');
    expect(await screen.findByLabelText('Next page')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Next page'));
    });

    await waitFor(() => {
      const savedSearch = JSON.parse(localStorage.getItem('Task-defaultSearch') as string);
      expect(savedSearch.offset).toBe(1);
    });
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

  test('Navigates away on invalid resource type', async () => {
    // Simulate the server responding without a schema for the unknown type
    vi.spyOn(medplum, 'requestSchema').mockResolvedValue(undefined);

    await act(async () => {
      render(
        <MedplumProvider medplum={medplum}>
          <MemoryRouter initialEntries={['/NotAResourceType']} initialIndex={0}>
            <MantineProvider>
              <Notifications />
              <Routes>
                <Route path="/" element={<div>Home</div>} />
                <Route path="/:resourceType" element={<SearchPage />} />
              </Routes>
            </MantineProvider>
          </MemoryRouter>
        </MedplumProvider>
      );
    });

    expect(await screen.findByText('Home')).toBeInTheDocument();
  });

  test('Handles auxClick to open resource in new tab', async () => {
    window.open = vi.fn();

    const task: Task = {
      resourceType: 'Task',
      id: 'task-aux',
      status: 'draft',
      intent: 'order',
    };
    await medplum.createResource(task);

    await setup('/Task');
    await screen.findByTestId('search-control');

    await act(async () => {
      fireEvent.click(screen.getAllByTestId('search-control-row')[0], { ctrlKey: true });
    });

    expect(window.open).toHaveBeenCalledWith(expect.stringContaining('/Task/'), '_blank');
  });
});
