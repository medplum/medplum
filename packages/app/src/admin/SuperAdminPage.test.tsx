import { Notifications, notifications } from '@mantine/notifications';
import { allOk, MedplumClient } from '@medplum/core';
import { AsyncJob, Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

function setup(medplum: MedplumClient): void {
  render(
    <MemoryRouter initialEntries={['/admin/super']} initialIndex={0}>
      <Notifications />
      <MedplumProvider medplum={medplum}>
        <AppRoutes />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('SuperAdminPage', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('Rebuild StructureDefinitions', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild StructureDefinitions'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Rebuild SearchParameters', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild SearchParameters'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Rebuild ValueSets', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild ValueSets'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Reindex resource type', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'completed',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Reindex Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Cancel reindex via toast', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'cancelled',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Reindex Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    expect(screen.getByText('Job cancelled')).toBeInTheDocument();
  });

  test('Reindex cancelled elsewhere', async () => {
    setup(medplum);

    jest.spyOn(medplum, 'startAsyncRequest').mockImplementationOnce(async () => {
      return {
        resourceType: 'AsyncJob',
        status: 'cancelled',
        request: 'mock-job',
        requestTime: new Date().toISOString(),
      } satisfies AsyncJob;
    });

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Reindex Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    await expect(screen.findByText('Job cancelled')).resolves.toBeInTheDocument();
  });

  test('Purge resources', async () => {
    setup(medplum);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Purge Resource Type'), { target: { value: 'AuditEvent' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Purge Before'), { target: { value: '2000-01-01T00:00:00Z' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Purge'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Remove Bot ID Jobs from Queue', async () => {
    setup(medplum);

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Bot Id'), { target: { value: 'BotId' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Jobs by Bot ID' }));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Force set password', async () => {
    setup(medplum);

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'alice@example.com' } });
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Password *'), { target: { value: 'override123' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Force Set Password' }));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Database Stats', async () => {
    setup(medplum);

    medplum.router.add('POST', '$db-stats', async () => {
      return [
        allOk,
        { resourceType: 'Parameters', parameter: [{ name: 'tableString', valueString: 'table1: 100\n' }] },
      ];
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get Database Stats' }));
    });

    expect(await screen.findByText('table1: 100')).toBeInTheDocument();
  });

  test('Database Stats - Specified table names', async () => {
    setup(medplum);

    medplum.router.add('POST', '$db-stats', async () => {
      return [
        allOk,
        { resourceType: 'Parameters', parameter: [{ name: 'tableString', valueString: 'table1: 100\n' }] },
      ];
    });

    const postSpy = jest.spyOn(medplum, 'post');

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Table Names (comma-delimited)'), { target: { value: 'Observation' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get Database Stats' }));
    });

    expect(await screen.findByText('table1: 100')).toBeInTheDocument();

    expect(postSpy).toHaveBeenCalledWith(
      'fhir/R4/$db-stats',
      expect.objectContaining({
        resourceType: 'Parameters',
        parameter: [{ name: 'tableNames', valueString: 'Observation' }],
      } satisfies Parameters)
    );
  });

  test('Access denied', async () => {
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementationOnce(() => false);
    setup(medplum);
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });
});
