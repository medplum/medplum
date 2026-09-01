// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { allOk } from '@medplum/core';
import type { OperationOutcome, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HealthGorillaHieImportEligibility } from '../../hooks/useHealthGorillaHieImportEligibility';
import { HieImportTab } from './HieImportTab';
import {
  getImportButtonLabel,
  HEALTH_GORILLA_HIE_P360_TASK_CODE,
  isImportDisabled,
  isTerminalTask,
} from './HieImportTab.utils';

const useSubscriptionMock = vi.hoisted(() => vi.fn());
vi.mock('@medplum/react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useSubscription: useSubscriptionMock };
});

const eligible: HealthGorillaHieImportEligibility = {
  eligible: true,
  hasHealthGorillaIdentifier: true,
  loading: false,
};

function task(status: Task['status'], overrides?: Partial<Task>): Task {
  return {
    resourceType: 'Task',
    id: `task-${status}`,
    status,
    intent: 'order',
    authoredOn: '2026-08-30T12:00:00Z',
    meta: { lastUpdated: '2026-08-31T12:00:00Z' },
    for: { reference: 'Patient/patient-1' },
    code: {
      coding: [
        {
          system: 'https://www.medplum.com/integrations/health-gorilla',
          code: 'p360-retrieve',
        },
      ],
    },
    ...overrides,
  };
}

function Parent(props: { eligibility: HealthGorillaHieImportEligibility }): JSX.Element {
  return <Outlet context={{ hieImportEligibility: props.eligibility }} />;
}

function setup(
  medplum: MockClient,
  options?: { eligibility?: HealthGorillaHieImportEligibility; initialPath?: string }
): ReturnType<typeof render> {
  const initialPath = options?.initialPath ?? '/Patient/patient-1/hie-import';
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <Routes>
            <Route path="/Patient/:patientId" element={<Parent eligibility={options?.eligibility ?? eligible} />}>
              <Route path="hie-import" element={<HieImportTab />} />
              <Route path="Task/:taskId" element={<div>Task detail destination</div>} />
            </Route>
          </Routes>
        </MantineProvider>
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('HieImportTab', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    useSubscriptionMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('does not query tasks and explains a direct ineligible route', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources');
    setup(medplum, {
      eligibility: { eligible: false, hasHealthGorillaIdentifier: false, loading: false },
    });

    expect(await screen.findByText('This patient does not have a Health Gorilla record identifier.')).toBeVisible();
    expect(searchSpy).not.toHaveBeenCalled();
    expect(useSubscriptionMock).not.toHaveBeenCalled();
  });

  test('shows capability-check errors on a direct route', async () => {
    const outcome: OperationOutcome = {
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', details: { text: 'operation check unavailable' } }],
    };
    setup(medplum, {
      eligibility: { eligible: false, hasHealthGorillaIdentifier: true, loading: false, outcome },
    });

    expect(await screen.findByText('operation check unavailable')).toBeVisible();
  });

  test('searches for the latest P360 Task and renders its status details and link', async () => {
    const latest = task('on-hold', { statusReason: { text: 'Manual review required' } });
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([latest] as any);
    setup(medplum);

    expect(await screen.findByText('On Hold')).toBeVisible();
    expect(screen.getByText('Manual review required')).toBeVisible();
    expect(screen.getByText('Authored').parentElement).toHaveTextContent('2026');
    expect(screen.getByText('Updated').parentElement).toHaveTextContent('2026');
    expect(screen.getByRole('link', { name: 'View Task' })).toHaveAttribute(
      'href',
      '/Patient/patient-1/Task/task-on-hold'
    );
    expect(screen.getByRole('button', { name: 'Import from HIE' })).toBeDisabled();

    const query = searchSpy.mock.calls[0][1] as URLSearchParams;
    expect(query.get('patient')).toBe('Patient/patient-1');
    expect(query.get('code')).toBe(HEALTH_GORILLA_HIE_P360_TASK_CODE);
    expect(query.get('_sort')).toBe('-_lastUpdated');
    expect(query.get('_count')).toBe('1');
    expect(searchSpy.mock.calls[0][2]).toEqual({ cache: 'reload' });
  });

  test('requires fresh consent, supports cancellation, and posts the exact operation once', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(allOk);
    setup(medplum);

    const importButton = await screen.findByRole('button', { name: 'Import from HIE' });
    await user.click(importButton);
    const confirm = await screen.findByRole('button', { name: 'Confirm and import' });
    expect(confirm).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    expect(confirm).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postSpy).not.toHaveBeenCalled();

    await user.click(importButton);
    expect(await screen.findByRole('button', { name: 'Confirm and import' })).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and import' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and import' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('Patient', 'patient-1', '$health-gorilla-hie-p360'), {});
    expect(await screen.findByText('HIE import request accepted')).toBeVisible();
  });

  test('locks modal controls during submission and never automatically retries a network error', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    let rejectPost: ((reason: Error) => void) | undefined;
    const deferred = new Promise<OperationOutcome>((_resolve, reject) => {
      rejectPost = reject;
    });
    const postSpy = vi.spyOn(medplum, 'post').mockReturnValue(deferred);
    setup(medplum);

    await user.click(await screen.findByRole('button', { name: 'Import from HIE' }));
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Confirm and import' }));

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
    rejectPost?.(new Error('network unavailable'));
    expect(await screen.findByText('network unavailable')).toBeVisible();
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  test('disables import safely when the latest Task query fails', async () => {
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Task lookup failed'));
    setup(medplum);

    expect(await screen.findByText('Task lookup failed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import from HIE' })).toBeDisabled();
  });

  test('refreshes from subscription notifications', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    setup(medplum);
    await screen.findByText('No previous Patient360 import was found for this patient.');

    expect(useSubscriptionMock).toHaveBeenCalledWith(
      expect.stringContaining('Task?patient=Patient/patient-1'),
      expect.any(Function)
    );
    const callback = useSubscriptionMock.mock.calls[0][1] as () => void;
    callback();
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
  });

  test('polls nonterminal tasks every 15 seconds and cleans up the timer', async () => {
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([task('in-progress')] as any);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const view = setup(medplum);

    await screen.findByText('In Progress');
    await waitFor(() => expect(setIntervalSpy.mock.calls.some((call) => call[1] === 15_000)).toBe(true));
    const pollCallIndex = setIntervalSpy.mock.calls.findIndex((call) => call[1] === 15_000);
    const poll = setIntervalSpy.mock.calls[pollCallIndex][0];
    const pollTimerId = setIntervalSpy.mock.results[pollCallIndex].value as number;
    poll();
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(pollTimerId);
  });

  test('does not poll a terminal Task', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([task('completed')] as any);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    setup(medplum);

    expect(await screen.findByRole('button', { name: 'Import Again' })).toBeEnabled();
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 15_000)).toBe(false);
  });

  test('allows a fresh consented retry after a definitive failure', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([task('failed')] as any);
    setup(medplum);

    const retry = await screen.findByRole('button', { name: 'Retry Import' });
    expect(retry).toBeEnabled();
    await user.click(retry);
    expect(await screen.findByRole('button', { name: 'Confirm and import' })).toBeDisabled();
  });
});

describe('HIE import Task state helpers', () => {
  test.each(['completed', 'failed', 'rejected', 'cancelled', 'entered-in-error'] as Task['status'][])(
    'treats %s as terminal',
    (status) => expect(isTerminalTask(task(status))).toBe(true)
  );

  test.each(['draft', 'requested', 'received', 'accepted', 'ready', 'in-progress', 'on-hold'] as Task['status'][])(
    'blocks the unexpected or open %s state',
    (status) => expect(isImportDisabled(task(status), false, undefined)).toBe(true)
  );

  test('labels completed and definitive failures for fresh imports', () => {
    expect(getImportButtonLabel(task('completed'))).toBe('Import Again');
    expect(getImportButtonLabel(task('failed'))).toBe('Retry Import');
    expect(getImportButtonLabel(undefined)).toBe('Import from HIE');
  });
});
