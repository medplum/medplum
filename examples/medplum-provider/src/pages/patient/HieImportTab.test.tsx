// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { MantineProvider } from '@mantine/core';
import { allOk } from '@medplum/core';
import type { List, OperationOutcome, ResourceType, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JSX } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { HealthGorillaHieImportEligibility } from '../../hooks/useHealthGorillaHieImportEligibility';
import { HieImportTab } from './HieImportTab';
import type { P360Mode, P360Phase } from './HieImportTab.utils';
import {
  formatP360Phase,
  getP360Mode,
  getP360Phase,
  isImportDisabled,
  isSelectiveTaskAwaitingSelection,
  isTerminalTask,
  P360_CODE_SYSTEM,
  P360_IMPORT_ALL_OPERATION,
  P360_IMPORT_SELECTIVE_OPERATION,
  P360_INGEST_SELECTED_OPERATION,
  P360_SOURCE_REFERENCE_SYSTEM,
  P360_TASK_CODE,
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

function codedType(code: string): { coding: { system: string; code: string }[] } {
  return { coding: [{ system: P360_CODE_SYSTEM, code }] };
}

function task(status: Task['status'], overrides?: Partial<Task>): Task {
  return {
    resourceType: 'Task',
    id: `task-${status}`,
    status,
    intent: 'order',
    authoredOn: '2026-08-30T12:00:00Z',
    meta: { versionId: '7', lastUpdated: '2026-08-31T12:00:00Z' },
    for: { reference: 'Patient/patient-1' },
    code: codedType('p360-retrieve'),
    ...overrides,
  };
}

function p360Task(status: Task['status'], mode: P360Mode, phase: P360Phase, overrides?: Partial<Task>): Task {
  return task(status, {
    input: [{ type: codedType('p360-mode'), valueCode: mode }],
    businessStatus: codedType(phase),
    ...overrides,
  });
}

function readyTask(listIds = ['manifest-1'], overrides?: Partial<Task>): Task {
  return p360Task('ready', 'selective', 'awaiting-selection', {
    id: 'selective-task',
    output: listIds.map((id) => ({
      type: codedType('p360-selection-manifest'),
      valueReference: { reference: `List/${id}` },
    })),
    ...overrides,
  });
}

function manifestEntry(
  identifier: string,
  resourceType: ResourceType,
  label: string,
  date = '2026-08-29T10:00:00Z'
): NonNullable<List['entry']>[number] {
  return {
    date,
    item: {
      reference: `https://api.healthgorilla.com/fhir/R4/${identifier}`,
      type: resourceType,
      display: label,
      identifier: { system: P360_SOURCE_REFERENCE_SYSTEM, value: identifier },
    },
  };
}

function manifestList(id: string, entries: NonNullable<List['entry']>, overrides?: Partial<List>): List {
  return {
    resourceType: 'List',
    id,
    status: 'current',
    mode: 'snapshot',
    code: codedType('p360-selection-manifest'),
    subject: { reference: 'Patient/patient-1' },
    entry: entries,
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

function mockManifestReads(medplum: MockClient, lists: Record<string, List>): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(medplum, 'readResource').mockImplementation(((_resourceType, id) => {
    const list = lists[id];
    return list ? Promise.resolve(list) : Promise.reject(new Error(`Missing List/${id}`));
  }) as typeof medplum.readResource);
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

  test('renders two equally explicit retrieval actions with neither workflow preselected', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    setup(medplum);

    expect(await screen.findByRole('button', { name: 'Import all records' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Choose records to import' })).toBeEnabled();
    expect(screen.getByText('Every supported record will be imported automatically after retrieval.')).toBeVisible();
    expect(
      screen.getByText('Retrieval will produce an inventory for review before anything is imported.')
    ).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test.each<[P360Mode, string, string]>([
    ['all', 'Import all records', P360_IMPORT_ALL_OPERATION],
    ['selective', 'Choose records to import', P360_IMPORT_SELECTIVE_OPERATION],
  ])('requires fresh treatment attestation and calls the exact %s operation once', async (_mode, action, operation) => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(allOk);
    setup(medplum);

    const actionButton = await screen.findByRole('button', { name: action });
    await user.click(actionButton);
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Confirm and import' })).toBeDisabled();
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(postSpy).not.toHaveBeenCalled();

    await user.click(actionButton);
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    await user.click(within(dialog).getByRole('checkbox'));
    const confirm = within(dialog).getByRole('button', { name: 'Confirm and import' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('Patient', 'patient-1', operation), {});
  });

  test('locks retrieval confirmation and does not retry network failures', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([] as any);
    let rejectPost: ((reason: Error) => void) | undefined;
    const deferred = new Promise<OperationOutcome>((_resolve, reject) => {
      rejectPost = reject;
    });
    const postSpy = vi.spyOn(medplum, 'post').mockReturnValue(deferred);
    setup(medplum);

    await user.click(await screen.findByRole('button', { name: 'Import all records' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and import' }));

    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(within(dialog).getByRole('checkbox')).toBeDisabled();
    rejectPost?.(new Error('network unavailable'));
    expect(await screen.findByText('network unavailable')).toBeVisible();
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  test('keeps polling when the first post-acknowledgement search still returns the previous Task', async () => {
    const user = userEvent.setup();
    const previous = p360Task('completed', 'all', 'retrieving', { id: 'previous-task' });
    const current = p360Task('in-progress', 'all', 'retrieving', {
      id: 'current-task',
      meta: { versionId: '1', lastUpdated: '2026-09-01T10:00:00Z' },
    });
    const searchSpy = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([previous] as any)
      .mockResolvedValueOnce([previous] as any)
      .mockResolvedValue([current] as any);
    vi.spyOn(medplum, 'post').mockResolvedValue(allOk);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    setup(medplum);

    await user.click(await screen.findByRole('button', { name: 'Import all records' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirm import-all retrieval' });
    await user.click(within(dialog).getByRole('checkbox'));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm and import' }));

    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(setIntervalSpy.mock.calls.some((call) => call[1] === 15_000)).toBe(true));
    const pollCall = setIntervalSpy.mock.calls.find((call) => call[1] === 15_000);
    expect(pollCall).toBeDefined();
    pollCall?.[0]();
    expect(await screen.findByText('In Progress')).toBeVisible();
  });

  test('shows ready Task details and blocks another billable retrieval', async () => {
    const latest = readyTask(['manifest-1'], {
      statusReason: { text: 'Review the inventory' },
      output: [
        { type: codedType('p360-selection-manifest'), valueReference: { reference: 'List/manifest-1' } },
        { type: codedType('p360-ignored-count'), valueUnsignedInt: 2 },
        { type: codedType('p360-unsupported-count'), valueUnsignedInt: 3 },
        { type: codedType('p360-selection-count'), valueUnsignedInt: 4 },
        { type: codedType('p360-imported-count'), valueUnsignedInt: 9 },
      ],
    });
    const searchSpy = vi.spyOn(medplum, 'searchResources').mockResolvedValue([latest] as any);
    mockManifestReads(medplum, { 'manifest-1': manifestList('manifest-1', []) });
    setup(medplum);

    expect((await screen.findAllByText('Awaiting selection')).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Mode').parentElement).toHaveTextContent('Selective');
    expect(screen.getByText('Business phase').parentElement).toHaveTextContent('Awaiting selection');
    expect(screen.getByText('Ignored inventory').parentElement).toHaveTextContent('2');
    expect(screen.getByText('Unsupported inventory').parentElement).toHaveTextContent('3');
    expect(screen.getByText('Selected roots').parentElement).toHaveTextContent('4');
    expect(screen.getByText('Imported resources').parentElement).toHaveTextContent('9');
    expect(screen.getByText('Review the inventory')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View Task' })).toHaveAttribute(
      'href',
      '/Patient/patient-1/Task/selective-task'
    );
    expect(screen.getByRole('button', { name: 'Import all records' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose records to import' })).toBeDisabled();

    const query = searchSpy.mock.calls[0][1] as URLSearchParams;
    expect(query.get('patient')).toBe('Patient/patient-1');
    expect(query.get('code')).toBe(P360_TASK_CODE);
    expect(query.get('_sort')).toBe('-_lastUpdated');
    expect(query.get('_count')).toBe('1');
  });

  test('disables both retrieval actions when the latest Task query fails', async () => {
    vi.spyOn(medplum, 'searchResources').mockRejectedValue(new Error('Task lookup failed'));
    setup(medplum);

    expect(await screen.findByText('Task lookup failed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import all records' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Choose records to import' })).toBeDisabled();
  });

  test('combines manifest chunks, groups records, and starts every checkbox unchecked', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask(['manifest-1', 'manifest-2'])] as any);
    mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [
        manifestEntry('Observation/obs-1', 'Observation', 'Hemoglobin'),
        manifestEntry('Condition/condition-1', 'Condition', 'Hypertension', '2026-08-28T09:00:00Z'),
      ]),
      'manifest-2': manifestList('manifest-2', [manifestEntry('Observation/obs-2', 'Observation', 'Platelet count')]),
    });
    setup(medplum);

    expect(await screen.findByText('Hemoglobin')).toBeVisible();
    expect(screen.getByText('Condition')).toBeVisible();
    expect(screen.getByText('Observation')).toBeVisible();
    expect(screen.getByText('Hypertension')).toBeVisible();
    expect(screen.getByText('Platelet count')).toBeVisible();
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).not.toBeChecked();
    }
    expect(screen.getByText(/Required referenced resources will be imported automatically/)).toBeVisible();
  });

  test('supports select all and clear selection and disables zero-record submission', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask()] as any);
    mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [
        manifestEntry('Observation/obs-1', 'Observation', 'Hemoglobin'),
        manifestEntry('Condition/condition-1', 'Condition', 'Hypertension'),
      ]),
    });
    setup(medplum);

    const importButton = await screen.findByRole('button', { name: 'Import selected records' });
    expect(importButton).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('2 selected')).toBeVisible();
    expect(importButton).toBeEnabled();
    for (const checkbox of screen.getAllByRole('checkbox')) {
      expect(checkbox).toBeChecked();
    }
    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.getByText('0 selected')).toBeVisible();
    expect(importButton).toBeDisabled();
  });

  test('requires second confirmation and posts exact selected Parameters without absolute references', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask()] as any);
    mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [
        manifestEntry('Observation/obs-1', 'Observation', 'Hemoglobin'),
        manifestEntry('Condition/condition-1', 'Condition', 'Hypertension'),
      ]),
    });
    const postSpy = vi.spyOn(medplum, 'post').mockResolvedValue(allOk);
    setup(medplum);

    await user.click(await screen.findByRole('button', { name: 'Select all' }));
    await user.click(screen.getByRole('button', { name: 'Import selected records' }));
    expect(postSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Confirm selected records' });
    expect(within(dialog).getByText(/Import 2 selected records/)).toHaveTextContent('Import 2 selected records');
    await user.click(within(dialog).getByRole('button', { name: 'Import selected records' }));

    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('Task', P360_INGEST_SELECTED_OPERATION), {
      resourceType: 'Parameters',
      parameter: [
        { name: 'task', valueReference: { reference: 'Task/selective-task' } },
        { name: 'taskVersion', valueString: '7' },
        { name: 'selected', valueString: 'Observation/obs-1' },
        { name: 'selected', valueString: 'Condition/condition-1' },
      ],
    });
    expect(JSON.stringify(postSpy.mock.calls[0][1])).not.toContain('api.healthgorilla.com');
  });

  test('fails safely when inventory entries are duplicated across chunks', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask(['manifest-1', 'manifest-2'])] as any);
    mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [manifestEntry('Observation/obs-1', 'Observation', 'First')]),
      'manifest-2': manifestList('manifest-2', [manifestEntry('Observation/obs-1', 'Observation', 'Duplicate')]),
    });
    setup(medplum);

    expect(await screen.findByText(/duplicate identifier Observation\/obs-1/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Import selected records' })).not.toBeInTheDocument();
  });

  test('fails safely when an inventory entry is malformed', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask()] as any);
    const malformed = manifestEntry('Observation/obs-1', 'Observation', 'Hemoglobin');
    malformed.item.identifier = { system: 'https://wrong.example/source-reference', value: 'Observation/obs-1' };
    mockManifestReads(medplum, { 'manifest-1': manifestList('manifest-1', [malformed]) });
    setup(medplum);

    expect(await screen.findByText(/malformed Patient360 inventory entry/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Import selected records' })).not.toBeInTheDocument();
  });

  test('refreshes after a conflict, clears selection, and reloads a drifted manifest', async () => {
    const user = userEvent.setup();
    const original = readyTask(['manifest-1']);
    const revised = readyTask(['manifest-2'], { meta: { ...original.meta, versionId: '8' } });
    vi.spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([original] as any)
      .mockResolvedValue([revised] as any);
    const readSpy = mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [manifestEntry('Observation/obs-1', 'Observation', 'Old result')]),
      'manifest-2': manifestList('manifest-2', [manifestEntry('Observation/obs-2', 'Observation', 'New result')]),
    });
    const postSpy = vi.spyOn(medplum, 'post').mockRejectedValue(new Error('stale Task conflict'));
    setup(medplum);

    await user.click(await screen.findByRole('checkbox', { name: /Old result/ }));
    await user.click(screen.getByRole('button', { name: 'Import selected records' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Confirm selected records' })).getByRole('button', {
        name: 'Import selected records',
      })
    );

    expect(await screen.findByText('stale Task conflict')).toBeVisible();
    expect(await screen.findByText('Inventory changed')).toBeVisible();
    expect(await screen.findByText('New result')).toBeVisible();
    expect(screen.getByText('0 selected')).toBeVisible();
    expect(readSpy).toHaveBeenCalledWith('List', 'manifest-2');
    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  test('prevents double submission of selected records', async () => {
    const user = userEvent.setup();
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask()] as any);
    mockManifestReads(medplum, {
      'manifest-1': manifestList('manifest-1', [manifestEntry('Observation/obs-1', 'Observation', 'Hemoglobin')]),
    });
    let resolvePost: ((outcome: OperationOutcome) => void) | undefined;
    const deferred = new Promise<OperationOutcome>((resolve) => {
      resolvePost = resolve;
    });
    const postSpy = vi.spyOn(medplum, 'post').mockReturnValue(deferred);
    setup(medplum);

    await user.click(await screen.findByRole('checkbox', { name: /Hemoglobin/ }));
    await user.click(screen.getByRole('button', { name: 'Import selected records' }));
    const confirm = within(await screen.findByRole('dialog', { name: 'Confirm selected records' })).getByRole(
      'button',
      {
        name: 'Import selected records',
      }
    );
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(postSpy).toHaveBeenCalledTimes(1));
    resolvePost?.(allOk);
  });

  test('discards with If-Match while preserving Task inputs and outputs', async () => {
    const user = userEvent.setup();
    const ready = readyTask();
    const cancelled = { ...ready, id: 'selective-task', status: 'cancelled' as const };
    vi.spyOn(medplum, 'searchResources')
      .mockResolvedValueOnce([ready] as any)
      .mockResolvedValue([cancelled] as any);
    mockManifestReads(medplum, { 'manifest-1': manifestList('manifest-1', []) });
    const updateSpy = vi.spyOn(medplum, 'updateResource').mockResolvedValue(cancelled);
    setup(medplum);

    await user.click(await screen.findByRole('button', { name: 'Discard retrieval' }));
    expect(updateSpy).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog', { name: 'Discard selective retrieval?' });
    await user.click(within(dialog).getByRole('button', { name: 'Discard retrieval' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: ready.id,
        status: 'cancelled',
        statusReason: { text: 'Selective Patient360 import discarded by user' },
        input: ready.input,
        output: ready.output,
        lastModified: expect.any(String),
      }),
      { headers: { 'if-match': 'W/"7"' } }
    );
    expect(await screen.findByText('The selective Patient360 retrieval was discarded.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Import all records' })).toBeEnabled();
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

  test('polls actively processing Tasks and cleans up the timer', async () => {
    const searchSpy = vi
      .spyOn(medplum, 'searchResources')
      .mockResolvedValue([p360Task('in-progress', 'selective', 'retrieving')] as any);
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    const view = setup(medplum);

    await screen.findByText('Retrieving records');
    await waitFor(() => expect(setIntervalSpy.mock.calls.some((call) => call[1] === 15_000)).toBe(true));
    const pollCallIndex = setIntervalSpy.mock.calls.findIndex((call) => call[1] === 15_000);
    const poll = setIntervalSpy.mock.calls[pollCallIndex][0];
    const pollTimerId = setIntervalSpy.mock.results[pollCallIndex].value as number;
    poll();
    await waitFor(() => expect(searchSpy).toHaveBeenCalledTimes(2));
    view.unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(pollTimerId);
  });

  test('stops polling at ready while leaving subscription refresh enabled', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([readyTask()] as any);
    mockManifestReads(medplum, { 'manifest-1': manifestList('manifest-1', []) });
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    setup(medplum);

    expect((await screen.findAllByText('Awaiting selection')).length).toBeGreaterThanOrEqual(2);
    expect(setIntervalSpy.mock.calls.some((call) => call[1] === 15_000)).toBe(false);
    expect(useSubscriptionMock).toHaveBeenCalledWith(expect.any(String), expect.any(Function));
  });

  test('requires no follow-up action for a completed import-all retrieval', async () => {
    vi.spyOn(medplum, 'searchResources').mockResolvedValue([
      p360Task('completed', 'all', 'retrieving', {
        output: [{ type: codedType('p360-imported-count'), valueUnsignedInt: 42 }],
      }),
    ] as any);
    const readSpy = vi.spyOn(medplum, 'readResource');
    setup(medplum);

    expect(await screen.findByText('Completed')).toBeVisible();
    expect(screen.getByText('Mode').parentElement).toHaveTextContent('Import all');
    expect(screen.getByText('Imported resources').parentElement).toHaveTextContent('42');
    expect(screen.queryByRole('button', { name: 'Import selected records' })).not.toBeInTheDocument();
    expect(readSpy).not.toHaveBeenCalled();
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

  test('reads exact-system mode and phase and recognizes ready selective Tasks', () => {
    const ready = readyTask();
    expect(getP360Mode(ready)).toBe('selective');
    expect(getP360Phase(ready)).toBe('awaiting-selection');
    expect(isSelectiveTaskAwaitingSelection(ready)).toBe(true);
    expect(getP360Mode({ ...ready, input: [{ type: codedType('p360-mode'), valueCode: 'invalid' }] })).toBeUndefined();
  });

  test.each<[P360Phase, string]>([
    ['retrieving', 'Retrieving records'],
    ['awaiting-selection', 'Awaiting selection'],
    ['importing-selection', 'Importing selected records'],
  ])('formats %s', (phase, label) => expect(formatP360Phase(phase)).toBe(label));
});
