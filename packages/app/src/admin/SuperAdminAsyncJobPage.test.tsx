import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { MedplumClient } from '@medplum/core';
import { AsyncJob, BundleEntry } from '@medplum/fhirtypes';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen, waitFor } from '../test-utils/render';

const MIGRATION_INFO_URL = 'admin/super/migrations';
const PENDING_BUNDLE_ENTRY: BundleEntry[] = [
  {
    resource: {
      id: '00000000-0000-0000-0000-000000000002',
      resourceType: 'AsyncJob',
      status: 'completed',
      type: 'data-migration',
      dataVersion: 1,
      requestTime: '2025-06-25T11:01:27Z',
      transactionTime: '2025-06-25T12:05:27Z',
      request: 'data-migration-v1',
    },
  },
  {
    resource: {
      id: '00000000-0000-0000-0000-000000000001',
      resourceType: 'AsyncJob',
      status: 'error',
      type: 'data-migration',
      dataVersion: 1,
      requestTime: '2025-06-25T11:01:27.000Z',
      request: 'data-migration-v1',
    },
  },
];

const COMPLETED_BUNDLE_ENTRY: BundleEntry[] = [
  {
    resource: {
      id: '00000000-0000-0000-0000-000000000003',
      resourceType: 'AsyncJob',
      status: 'completed',
      type: 'data-migration',
      dataVersion: 3,
      requestTime: '2025-06-26T11:00:00Z',
      transactionTime: '2025-06-26T11:00:30Z',
      request: 'data-migration-v3',
    },
  },
  {
    resource: {
      id: '00000000-0000-0000-0000-000000000002',
      resourceType: 'AsyncJob',
      status: 'completed',
      type: 'data-migration',
      dataVersion: 2,
      requestTime: '2025-06-26T11:00:00Z',
      transactionTime: '2025-06-26T11:39:00Z',
      request: 'data-migration-v2',
    },
  },
  {
    resource: {
      id: '00000000-0000-0000-0000-000000000003',
      resourceType: 'AsyncJob',
      status: 'completed',
      type: 'data-migration',
      dataVersion: 1,
      requestTime: '2025-06-25T11:01:27Z',
      transactionTime: '2025-06-25T12:05:27Z',
      request: 'data-migration-v1',
    },
  },
];

let asyncJobBundleEntry: BundleEntry[] = [];

function mockFetch(url: string, options: { method: string; body: string }): Promise<any> {
  let status = 404;
  let result: any;

  if (options.method === 'GET' && url.startsWith(BASE_URL + MIGRATION_INFO_URL)) {
    status = 200;
    result = { postDeployMigrations: [1, 2, 3], pendingPostDeployMigration: 2 };
  } else if (options.method === 'GET' && url.startsWith(BASE_URL + 'fhir/R4/AsyncJob')) {
    status = 200;
    result = {
      resourceType: 'Bundle',
      entry: asyncJobBundleEntry,
    };
  } else {
    throw new Error('Unexpected URL ' + url);
  }

  return Promise.resolve({
    status,
    ok: status < 400,
    headers: { get: () => 'application/fhir+json' },
    json: () => Promise.resolve(result),
  });
}

async function setup(medplum: MedplumClient): Promise<void> {
  await act(async () => {
    // renderAppRoutes(medplum, '/admin/super/asyncjob');
    render(
      <MedplumProvider medplum={medplum}>
        <MemoryRouter initialEntries={['/admin/super/asyncjob']} initialIndex={0}>
          <MantineProvider>
            <Notifications />
            <AppRoutes />
          </MantineProvider>
        </MemoryRouter>
      </MedplumProvider>
    );
  });
}

let isSuperAdminVal: boolean;

const BASE_URL = 'https://example.com/';
describe('SuperAdminAsyncJobPage', () => {
  let medplum: MedplumClient;

  beforeEach(() => {
    isSuperAdminVal = true;
    asyncJobBundleEntry = PENDING_BUNDLE_ENTRY;
    medplum = new MedplumClient({ fetch: mockFetch, baseUrl: BASE_URL });
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => isSuperAdminVal);
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
    jest.clearAllMocks();
  });

  test('Renders page title', async () => {
    await setup(medplum);
    expect(screen.getByText('AsyncJob Dashboard')).toBeInTheDocument();
  });

  test('Access denied', async () => {
    isSuperAdminVal = false;
    await setup(medplum);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });

  test('Tab switching', async () => {
    await setup(medplum);

    const systemAsyncJobTab = screen.getByText('System AsyncJob');
    const postDeployMigrationsTab = screen.getByText('Post-deploy Migrations');

    expect(systemAsyncJobTab).toBeInTheDocument();
    expect(postDeployMigrationsTab).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(postDeployMigrationsTab);
    });

    await act(async () => {
      fireEvent.click(systemAsyncJobTab);
    });

    await waitFor(() => screen.getByText('00000000-0000-0000-0000-000000000002'));

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      fireEvent.click(screen.getByText('00000000-0000-0000-0000-000000000002'), { button: 1 });
    });
    expect(errorSpy).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByText('00000000-0000-0000-0000-000000000002'));
    });
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  test('Renders migrations table and start migration', async () => {
    const startAsyncJobSpy = jest.spyOn(medplum, 'startAsyncRequest').mockResolvedValueOnce({} as AsyncJob);
    await setup(medplum);

    await waitFor(() => screen.getByText('Refresh'));

    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('Refresh')).toBeInTheDocument();

    expect(screen.getAllByRole('row')).toHaveLength(4); // Header + 3 migrations

    // Show all for v1
    const showAllButton = screen.getByText('Show all');
    await act(async () => {
      fireEvent.click(showAllButton);
    });
    expect(screen.getAllByRole('row')).toHaveLength(5); // Header + 3 migrations + 1 expanded

    // Hide all for v1
    const hideAllButton = screen.getByText('Hide all');
    await act(async () => {
      fireEvent.click(hideAllButton);
    });
    expect(screen.getAllByRole('row')).toHaveLength(4); // Header + 3 migrations

    // Run the pending migration
    const runMigrationButton = screen.getByText('Start');
    expect(runMigrationButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(runMigrationButton);
    });

    expect(startAsyncJobSpy).toHaveBeenCalledWith(
      'admin/super/migrate',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ dataVersion: 2 }) })
    );
  });

  test('Render w/ all migrations completed', async () => {
    asyncJobBundleEntry = COMPLETED_BUNDLE_ENTRY;
    await setup(medplum);
    await waitFor(() => screen.getByText('Refresh'));
    expect(screen.getAllByRole('row')).toHaveLength(4); // Header + 3 migrations
    expect(screen.queryByText('Start')).not.toBeInTheDocument();
  });

  describe('System AsyncJob', () => {
    test('Renders search control', async () => {
      await setup(medplum);

      const systemAsyncJobTab = screen.getByText('System AsyncJob');
      await act(async () => {
        fireEvent.click(systemAsyncJobTab);
      });

      await waitFor(() => screen.getByText('Show in search page'));

      expect(screen.getByText('Show in search page')).toBeInTheDocument();
    });
  });
});
