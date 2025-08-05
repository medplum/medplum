// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { allOk, forbidden } from '@medplum/core';
import { Parameters } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { getDefaultNormalizer } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AppRoutes } from '../AppRoutes';
import { act, fireEvent, render, screen } from '../test-utils/render';

const medplum = new MockClient();

function setup(): void {
  render(
    <MedplumProvider medplum={medplum}>
      <MemoryRouter initialEntries={['/admin/super']} initialIndex={0}>
        <MantineProvider>
          <Notifications />
          <AppRoutes />
        </MantineProvider>
      </MemoryRouter>
    </MedplumProvider>
  );
}

describe('SuperAdminPage', () => {
  beforeEach(() => {
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementation(() => true);
  });

  afterEach(async () => {
    await act(async () => notifications.clean());
  });

  test('Rebuild StructureDefinitions', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild StructureDefinitions'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Rebuild SearchParameters', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild SearchParameters'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Rebuild ValueSets', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Rebuild ValueSets'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Start data migration', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByText('Start Migration'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Reindex resource type', async () => {
    setup();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Reindex Resource Type'), { target: { value: 'Patient' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Reindex'));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Purge resources', async () => {
    setup();

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
    setup();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Bot Id'), { target: { value: 'BotId' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove Jobs by Bot ID' }));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Force set password', async () => {
    setup();

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

  test('Invalid indexes', async () => {
    setup();

    const expectString = 'Some__column_idx:\n  [is_valid: false]';
    medplum.router.add('POST', '$db-invalid-indexes', async () => {
      return [
        allOk,
        {
          resourceType: 'Parameters',
          parameter: [{ name: 'invalidIndex', valueString: expectString }],
        },
      ];
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get Database Invalid Indexes' }));
    });

    expect(
      await screen.findByText(expectString, {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      })
    ).toBeInTheDocument();
  });

  test('Database Stats', async () => {
    setup();

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
    setup();

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

  test('Get Database Schema Drift', async () => {
    setup();

    const returnValue = 'This is a fake return value';
    medplum.router.add('POST', '$db-schema-diff', async () => {
      return [
        allOk,
        {
          resourceType: 'Parameters',
          parameter: [{ name: 'migrationString', valueString: returnValue }],
        },
      ];
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Get Schema Drift' }));
    });

    expect(await screen.findByText(returnValue)).toBeInTheDocument();
  });

  test('Reconcile Database Schema Drift - Success', async () => {
    setup();
    const startAsyncRequestSpy = jest.spyOn(medplum, 'startAsyncRequest').mockResolvedValueOnce({
      resourceType: 'AsyncJob',
      id: '123',
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconcile Schema Drift' }));
    });

    expect(screen.getByText('View AsyncJob')).toBeInTheDocument();
    expect(startAsyncRequestSpy).toHaveBeenCalledTimes(1);
    startAsyncRequestSpy.mockRestore();
  });

  test('Reconcile Database Schema Drift - Forbidden', async () => {
    setup();
    const startAsyncRequestSpy = jest.spyOn(medplum, 'startAsyncRequest').mockResolvedValueOnce(forbidden);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reconcile Schema Drift' }));
    });

    expect(screen.getByText('Forbidden')).toBeInTheDocument();
    expect(startAsyncRequestSpy).toHaveBeenCalledTimes(1);
    startAsyncRequestSpy.mockRestore();
  });

  test('Reload cron resources', async () => {
    setup();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reload Cron Resources' }));
    });

    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  test('Access denied', async () => {
    jest.spyOn(medplum, 'isSuperAdmin').mockImplementationOnce(() => false);
    setup();
    expect(screen.getByText('Forbidden')).toBeInTheDocument();
  });
});
