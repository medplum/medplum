// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import {
  formatCodeableConcept,
  formatDateTime,
  isOk,
  normalizeOperationOutcome,
  operationOutcomeIssueToString,
} from '@medplum/core';
import type { OperationOutcome, Parameters, Task } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, useMedplum, useSubscription } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import type { HealthGorillaHieImportEligibility } from '../../hooks/useHealthGorillaHieImportEligibility';
import type { P360InventoryItem, P360Mode } from './HieImportTab.utils';
import {
  formatP360Phase,
  formatTaskStatus,
  getP360IgnoredCount,
  getP360ImportedCount,
  getP360ManifestListIds,
  getP360ManifestRevisionKey,
  getP360Mode,
  getP360Phase,
  getP360SelectedCount,
  getP360UnsupportedCount,
  getTaskStatusColor,
  HIE_TASK_POLL_INTERVAL_MS,
  isImportDisabled,
  isSelectiveTaskAwaitingSelection,
  isTaskActivelyProcessing,
  isTerminalTask,
  P360_IMPORT_ALL_OPERATION,
  P360_IMPORT_SELECTIVE_OPERATION,
  P360_INGEST_SELECTED_OPERATION,
  P360_TASK_CODE,
  parseP360InventoryLists,
} from './HieImportTab.utils';

interface HieImportOutletContext {
  hieImportEligibility: HealthGorillaHieImportEligibility;
}

interface ActionFeedback {
  outcome: OperationOutcome;
  successTitle: string;
  failureTitle: string;
}

interface InventoryState {
  key: string;
  loading: boolean;
  items: P360InventoryItem[];
  outcome?: OperationOutcome;
}

interface PendingSelection {
  ids: string[];
  revisionKey: string;
  taskId: string;
  taskVersion: string;
}

export function HieImportTab(): JSX.Element {
  const { patientId } = useParams() as { patientId: string };
  const { hieImportEligibility } = useOutletContext<HieImportOutletContext>();

  if (hieImportEligibility.loading) {
    return (
      <Document maw={700}>
        <Loader aria-label="Checking HIE import eligibility" />
      </Document>
    );
  }

  if (!hieImportEligibility.eligible) {
    return (
      <Document maw={700}>
        {hieImportEligibility.outcome ? (
          <OperationOutcomeAlert outcome={hieImportEligibility.outcome} title="HIE availability check failed" />
        ) : (
          <Alert icon={<IconAlertCircle size={16} />} color="yellow" title="HIE import unavailable">
            {hieImportEligibility.hasHealthGorillaIdentifier
              ? 'The linked Health Gorilla HIE integration is not available for this project.'
              : 'This patient does not have a Health Gorilla record identifier.'}
          </Alert>
        )}
      </Document>
    );
  }

  return <EligibleHieImportTab key={patientId} patientId={patientId} />;
}

function EligibleHieImportTab(props: { patientId: string }): JSX.Element {
  const { patientId } = props;
  const medplum = useMedplum();
  const [latestTask, setLatestTask] = useState<Task>();
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskOutcome, setTaskOutcome] = useState<OperationOutcome>();
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback>();
  const [actionSuccess, setActionSuccess] = useState<string>();
  const [requestedMode, setRequestedMode] = useState<P360Mode>();
  const [consentOpened, setConsentOpened] = useState(false);
  const [attested, setAttested] = useState(false);
  const [retrievalSubmitting, setRetrievalSubmitting] = useState(false);
  const [awaitingTask, setAwaitingTask] = useState(false);
  const [inventoryState, setInventoryState] = useState<InventoryState>({ key: '', loading: false, items: [] });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionConfirmOpened, setSelectionConfirmOpened] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection>();
  const [selectionSubmitting, setSelectionSubmitting] = useState(false);
  const [discardOpened, setDiscardOpened] = useState(false);
  const [pendingDiscardTask, setPendingDiscardTask] = useState<Task>();
  const [discardSubmitting, setDiscardSubmitting] = useState(false);
  const [inventoryChanged, setInventoryChanged] = useState(false);
  const retrievalSubmittingRef = useRef(false);
  const selectionSubmittingRef = useRef(false);
  const discardSubmittingRef = useRef(false);
  const taskRefreshGenerationRef = useRef(0);
  const inventoryGenerationRef = useRef(0);
  const inventoryLoadKeyRef = useRef('');
  const previousInventoryKeyRef = useRef('');
  const awaitingTaskBaselineRef = useRef('');

  const refreshLatestTask = useCallback(async (): Promise<Task | undefined> => {
    const generation = ++taskRefreshGenerationRef.current;
    try {
      const tasks = await medplum.searchResources(
        'Task',
        new URLSearchParams({
          patient: `Patient/${patientId}`,
          code: P360_TASK_CODE,
          _sort: '-_lastUpdated',
          _count: '1',
        }),
        { cache: 'reload' }
      );
      const task = tasks[0];
      if (generation === taskRefreshGenerationRef.current) {
        setLatestTask(task);
        if (
          task &&
          (!awaitingTaskBaselineRef.current ||
            getTaskVersionKey(task) !== awaitingTaskBaselineRef.current ||
            !isTerminalTask(task))
        ) {
          setAwaitingTask(false);
          awaitingTaskBaselineRef.current = '';
        }
        setTaskOutcome(undefined);
        return task;
      }
    } catch (err) {
      if (generation === taskRefreshGenerationRef.current) {
        setTaskOutcome(normalizeOperationOutcome(err));
      }
    } finally {
      if (generation === taskRefreshGenerationRef.current) {
        setTaskLoading(false);
      }
    }
    return undefined;
  }, [medplum, patientId]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) {
          return refreshLatestTask();
        }
        return undefined;
      })
      .catch(console.error);
    return () => {
      cancelled = true;
      taskRefreshGenerationRef.current += 1;
    };
  }, [refreshLatestTask]);

  const subscriptionCriteria = `Task?patient=Patient/${patientId}&code=${encodeURIComponent(P360_TASK_CODE)}`;
  useSubscription(subscriptionCriteria, () => {
    refreshLatestTask().catch(console.error);
  });

  useEffect(() => {
    if (!awaitingTask && !isTaskActivelyProcessing(latestTask)) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      refreshLatestTask().catch(console.error);
    }, HIE_TASK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [awaitingTask, latestTask, refreshLatestTask]);

  const readySelectiveTask = latestTask && isSelectiveTaskAwaitingSelection(latestTask) ? latestTask : undefined;
  const inventoryKey = readySelectiveTask ? getP360ManifestRevisionKey(readySelectiveTask) : '';

  useEffect(() => {
    if (inventoryLoadKeyRef.current === inventoryKey) {
      return undefined;
    }
    inventoryLoadKeyRef.current = inventoryKey;
    const generation = ++inventoryGenerationRef.current;
    const task = readySelectiveTask;
    Promise.resolve()
      .then(async () => {
        setSelectedIds([]);
        setSelectionConfirmOpened(false);
        setPendingSelection(undefined);
        if (!task || !inventoryKey) {
          previousInventoryKeyRef.current = '';
          setInventoryChanged(false);
          setInventoryState({ key: '', loading: false, items: [] });
          return undefined;
        }
        if (previousInventoryKeyRef.current && previousInventoryKeyRef.current !== inventoryKey) {
          setInventoryChanged(true);
        }
        previousInventoryKeyRef.current = inventoryKey;
        setInventoryState({ key: inventoryKey, loading: true, items: [] });
        const listIds = getP360ManifestListIds(task);
        const lists = await Promise.all(listIds.map((id) => medplum.readResource('List', id)));
        return parseP360InventoryLists(lists, patientId);
      })
      .then((items) => {
        if (items && generation === inventoryGenerationRef.current) {
          setInventoryState({ key: inventoryKey, loading: false, items });
        }
      })
      .catch((err) => {
        if (generation === inventoryGenerationRef.current) {
          setInventoryState({
            key: inventoryKey,
            loading: false,
            items: [],
            outcome: normalizeOperationOutcome(err),
          });
        }
      });
    return () => {
      inventoryGenerationRef.current += 1;
    };
  }, [inventoryKey, medplum, patientId, readySelectiveTask]);

  const inventory =
    inventoryState.key === inventoryKey
      ? inventoryState
      : { key: inventoryKey, loading: !!readySelectiveTask, items: [] };
  const groupedInventory = useMemo(() => {
    const groups = new Map<string, P360InventoryItem[]>();
    for (const item of inventory.items) {
      const group = groups.get(item.resourceType) ?? [];
      group.push(item);
      groups.set(item.resourceType, group);
    }
    return [...groups.entries()];
  }, [inventory.items]);

  const openConsent = (mode: P360Mode): void => {
    setRequestedMode(mode);
    setAttested(false);
    setConsentOpened(true);
  };

  const closeConsent = (): void => {
    if (!retrievalSubmittingRef.current) {
      setRequestedMode(undefined);
      setAttested(false);
      setConsentOpened(false);
    }
  };

  const confirmRetrieval = async (): Promise<void> => {
    if (
      !requestedMode ||
      !attested ||
      retrievalSubmittingRef.current ||
      isImportDisabled(latestTask, taskLoading, taskOutcome)
    ) {
      return;
    }
    const mode = requestedMode;
    retrievalSubmittingRef.current = true;
    setRetrievalSubmitting(true);
    setActionFeedback(undefined);
    setActionSuccess(undefined);
    setInventoryChanged(false);
    try {
      const outcome = await medplum.post<OperationOutcome>(
        medplum.fhirUrl(
          'Patient',
          patientId,
          mode === 'all' ? P360_IMPORT_ALL_OPERATION : P360_IMPORT_SELECTIVE_OPERATION
        ),
        {}
      );
      setActionFeedback({
        outcome,
        successTitle: mode === 'all' ? 'Import-all request accepted' : 'Selective retrieval accepted',
        failureTitle: 'HIE retrieval request failed',
      });
      if (isOk(outcome)) {
        awaitingTaskBaselineRef.current = latestTask ? getTaskVersionKey(latestTask) : '';
        setAwaitingTask(true);
      }
    } catch (err) {
      setActionFeedback({
        outcome: normalizeOperationOutcome(err),
        successTitle: 'HIE retrieval request accepted',
        failureTitle: 'HIE retrieval request failed',
      });
    } finally {
      await refreshLatestTask();
      retrievalSubmittingRef.current = false;
      setRetrievalSubmitting(false);
      setRequestedMode(undefined);
      setAttested(false);
      setConsentOpened(false);
    }
  };

  const toggleSelection = (identifier: string, checked: boolean): void => {
    setSelectedIds((current) => {
      if (!checked) {
        return current.filter((id) => id !== identifier);
      }
      return current.includes(identifier) ? current : [...current, identifier];
    });
  };

  const openSelectionConfirmation = (): void => {
    if (
      !readySelectiveTask?.id ||
      !readySelectiveTask.meta?.versionId ||
      selectedIds.length === 0 ||
      inventory.loading ||
      inventory.outcome
    ) {
      return;
    }
    setPendingSelection({
      ids: [...selectedIds],
      revisionKey: inventoryKey,
      taskId: readySelectiveTask.id,
      taskVersion: readySelectiveTask.meta.versionId,
    });
    setSelectionConfirmOpened(true);
  };

  const closeSelectionConfirmation = (): void => {
    if (!selectionSubmittingRef.current) {
      setSelectionConfirmOpened(false);
      setPendingSelection(undefined);
    }
  };

  const confirmSelectedImport = async (): Promise<void> => {
    if (selectionSubmittingRef.current || !pendingSelection) {
      return;
    }
    const task = readySelectiveTask;
    if (
      !task?.id ||
      !task.meta?.versionId ||
      task.id !== pendingSelection.taskId ||
      task.meta.versionId !== pendingSelection.taskVersion ||
      inventoryKey !== pendingSelection.revisionKey
    ) {
      setSelectedIds([]);
      setInventoryChanged(true);
      setSelectionConfirmOpened(false);
      setPendingSelection(undefined);
      return;
    }
    const parameters: Parameters = {
      resourceType: 'Parameters',
      parameter: [
        { name: 'task', valueReference: { reference: `Task/${task.id}` } },
        { name: 'taskVersion', valueString: task.meta.versionId },
        ...pendingSelection.ids.map((valueString) => ({ name: 'selected', valueString })),
      ],
    };
    selectionSubmittingRef.current = true;
    setSelectionSubmitting(true);
    setActionFeedback(undefined);
    setActionSuccess(undefined);
    try {
      const outcome = await medplum.post<OperationOutcome>(
        medplum.fhirUrl('Task', P360_INGEST_SELECTED_OPERATION),
        parameters
      );
      setActionFeedback({
        outcome,
        successTitle: 'Selected records import accepted',
        failureTitle: 'Selected records import failed',
      });
    } catch (err) {
      setActionFeedback({
        outcome: normalizeOperationOutcome(err),
        successTitle: 'Selected records import accepted',
        failureTitle: 'Selected records import failed',
      });
    } finally {
      setSelectedIds([]);
      setSelectionConfirmOpened(false);
      setPendingSelection(undefined);
      await refreshLatestTask();
      selectionSubmittingRef.current = false;
      setSelectionSubmitting(false);
    }
  };

  const closeDiscard = (): void => {
    if (!discardSubmittingRef.current) {
      setDiscardOpened(false);
      setPendingDiscardTask(undefined);
    }
  };

  const openDiscard = (): void => {
    if (readySelectiveTask?.id && readySelectiveTask.meta?.versionId) {
      setPendingDiscardTask(readySelectiveTask);
      setDiscardOpened(true);
    }
  };

  const confirmDiscard = async (): Promise<void> => {
    const task = pendingDiscardTask;
    if (discardSubmittingRef.current || !task?.id || !task.meta?.versionId) {
      return;
    }
    discardSubmittingRef.current = true;
    setDiscardSubmitting(true);
    setActionFeedback(undefined);
    setActionSuccess(undefined);
    try {
      await medplum.updateResource(
        {
          ...task,
          status: 'cancelled',
          statusReason: { text: 'Selective Patient360 import discarded by user' },
          lastModified: new Date().toISOString(),
        },
        { headers: { 'if-match': `W/"${task.meta.versionId}"` } }
      );
      setActionSuccess('The selective Patient360 retrieval was discarded.');
    } catch (err) {
      setActionFeedback({
        outcome: normalizeOperationOutcome(err),
        successTitle: 'Retrieval discarded',
        failureTitle: 'Unable to discard retrieval',
      });
    } finally {
      setSelectedIds([]);
      setDiscardOpened(false);
      setPendingDiscardTask(undefined);
      await refreshLatestTask();
      discardSubmittingRef.current = false;
      setDiscardSubmitting(false);
    }
  };

  const anySubmitting = retrievalSubmitting || selectionSubmitting || discardSubmitting;
  const retrievalDisabled = isImportDisabled(latestTask, taskLoading, taskOutcome) || anySubmitting;

  return (
    <Document maw={800}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Health Gorilla HIE Import</Title>
          <Text c="dimmed" mt="xs">
            This patient has a Health Gorilla record and is eligible for HIE synchronization.
          </Text>
        </div>

        <Alert icon={<IconInfoCircle size={16} />} color="blue" title="Production network request">
          Each confirmed retrieval starts a metered Patient360 network request. Imported records arrive asynchronously.
        </Alert>

        {actionFeedback && isOk(actionFeedback.outcome) ? (
          <Alert icon={<IconCircleCheck size={16} />} color="green" title={actionFeedback.successTitle}>
            {actionFeedback.outcome.issue.map(operationOutcomeIssueToString).join(' ') || 'The request was accepted.'}
          </Alert>
        ) : (
          actionFeedback && (
            <OperationOutcomeAlert outcome={actionFeedback.outcome} title={actionFeedback.failureTitle} />
          )
        )}
        {actionSuccess && (
          <Alert icon={<IconCircleCheck size={16} />} color="green" title="Retrieval discarded">
            {actionSuccess}
          </Alert>
        )}
        {taskOutcome && <OperationOutcomeAlert outcome={taskOutcome} title="Latest HIE import status unavailable" />}

        <LatestTaskCard patientId={patientId} task={latestTask} loading={taskLoading} />

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <RetrievalAction
            title="Import all records"
            description="Every supported record will be imported automatically after retrieval."
            disabled={retrievalDisabled}
            loading={retrievalSubmitting && requestedMode === 'all'}
            onClick={() => openConsent('all')}
          />
          <RetrievalAction
            title="Choose records to import"
            description="Retrieval will produce an inventory for review before anything is imported."
            disabled={retrievalDisabled}
            loading={retrievalSubmitting && requestedMode === 'selective'}
            onClick={() => openConsent('selective')}
          />
        </SimpleGrid>

        {latestTask && !isTerminalTask(latestTask) && (
          <Text size="sm" c="dimmed">
            Another billable retrieval cannot start while the latest request is{' '}
            {isSelectiveTaskAwaitingSelection(latestTask)
              ? 'awaiting selection'
              : formatTaskStatus(latestTask.status).toLowerCase()}
            .
          </Text>
        )}

        {readySelectiveTask && (
          <SelectionPanel
            task={readySelectiveTask}
            inventory={inventory}
            groupedInventory={groupedInventory}
            selectedIds={selectedIds}
            inventoryChanged={inventoryChanged}
            submitting={selectionSubmitting || discardSubmitting}
            onToggle={toggleSelection}
            onSelectAll={() => setSelectedIds(inventory.items.map((item) => item.identifier))}
            onClear={() => setSelectedIds([])}
            onImport={openSelectionConfirmation}
            onDiscard={openDiscard}
          />
        )}
      </Stack>

      <Modal
        opened={consentOpened}
        onClose={closeConsent}
        title={requestedMode === 'all' ? 'Confirm import-all retrieval' : 'Confirm selective retrieval'}
        centered
        closeOnClickOutside={!retrievalSubmitting}
        closeOnEscape={!retrievalSubmitting}
        withCloseButton={!retrievalSubmitting}
      >
        <Stack gap="md">
          <Text size="sm">
            Confirm that this Patient360 retrieval is authorized for this patient and the permitted treatment purpose.
          </Text>
          <Checkbox
            checked={attested}
            disabled={retrievalSubmitting}
            onChange={(event) => setAttested(event.currentTarget.checked)}
            label="I attest that this HIE retrieval is authorized for treatment of this patient."
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConsent} disabled={retrievalSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmRetrieval().catch(console.error)}
              disabled={!requestedMode || !attested || retrievalSubmitting}
              loading={retrievalSubmitting}
            >
              Confirm and import
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={selectionConfirmOpened}
        onClose={closeSelectionConfirmation}
        title="Confirm selected records"
        centered
        closeOnClickOutside={!selectionSubmitting}
        closeOnEscape={!selectionSubmitting}
        withCloseButton={!selectionSubmitting}
      >
        <Stack gap="md">
          <Text size="sm">
            Import {pendingSelection?.ids.length ?? 0} selected{' '}
            {(pendingSelection?.ids.length ?? 0) === 1 ? 'record' : 'records'} and all required referenced resources?
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeSelectionConfirmation} disabled={selectionSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmSelectedImport().catch(console.error)}
              disabled={!pendingSelection || selectionSubmitting}
              loading={selectionSubmitting}
            >
              Import selected records
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={discardOpened}
        onClose={closeDiscard}
        title="Discard selective retrieval?"
        centered
        closeOnClickOutside={!discardSubmitting}
        closeOnEscape={!discardSubmitting}
        withCloseButton={!discardSubmitting}
      >
        <Stack gap="md">
          <Text size="sm">
            The retrieved inventory will remain on the cancelled Task for audit purposes, but none of its records will
            be imported.
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={closeDiscard} disabled={discardSubmitting}>
              Cancel
            </Button>
            <Button
              color="red"
              onClick={() => confirmDiscard().catch(console.error)}
              disabled={discardSubmitting}
              loading={discardSubmitting}
            >
              Discard retrieval
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
  );
}

function RetrievalAction(props: {
  title: string;
  description: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <Paper withBorder p="md">
      <Stack h="100%" justify="space-between">
        <div>
          <Text fw={600}>{props.title}</Text>
          <Text size="sm" c="dimmed" mt="xs">
            {props.description}
          </Text>
        </div>
        <Button onClick={props.onClick} disabled={props.disabled} loading={props.loading} fullWidth>
          {props.title}
        </Button>
      </Stack>
    </Paper>
  );
}

function SelectionPanel(props: {
  task: Task;
  inventory: InventoryState;
  groupedInventory: [string, P360InventoryItem[]][];
  selectedIds: string[];
  inventoryChanged: boolean;
  submitting: boolean;
  onToggle: (identifier: string, checked: boolean) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onImport: () => void;
  onDiscard: () => void;
}): JSX.Element {
  const missingVersion = !props.task.id || !props.task.meta?.versionId;
  return (
    <Paper withBorder p="md">
      <Stack gap="md">
        <div>
          <Title order={3}>Choose records to import</Title>
          <Text size="sm" c="dimmed" mt="xs">
            Review the retrieved inventory. No clinical records are imported until you confirm a selection.
          </Text>
        </div>
        {props.inventoryChanged && (
          <Alert color="yellow" title="Inventory changed">
            The Task or manifest was updated. Review the refreshed inventory before selecting records again.
          </Alert>
        )}
        {props.inventory.loading && (
          <Group>
            <Loader size="sm" />
            <Text size="sm">Loading selection inventory…</Text>
          </Group>
        )}
        {!props.inventory.loading && props.inventory.outcome && (
          <OperationOutcomeAlert outcome={props.inventory.outcome} title="Unable to load selection inventory" />
        )}
        {!props.inventory.loading && !props.inventory.outcome && (
          <>
            <Group>
              <Button
                variant="default"
                size="xs"
                onClick={props.onSelectAll}
                disabled={props.inventory.items.length === 0 || props.submitting}
              >
                Select all
              </Button>
              <Button
                variant="subtle"
                size="xs"
                onClick={props.onClear}
                disabled={props.selectedIds.length === 0 || props.submitting}
              >
                Clear selection
              </Button>
              <Text size="sm">{props.selectedIds.length} selected</Text>
            </Group>
            {props.groupedInventory.length === 0 ? (
              <Text size="sm" c="dimmed">
                No supported records are available to select.
              </Text>
            ) : (
              props.groupedInventory.map(([resourceType, items]) => (
                <Stack key={resourceType} gap="xs">
                  <Text fw={600}>{resourceType}</Text>
                  {items.map((item) => (
                    <Checkbox
                      key={item.identifier}
                      checked={props.selectedIds.includes(item.identifier)}
                      disabled={props.submitting}
                      onChange={(event) => props.onToggle(item.identifier, event.currentTarget.checked)}
                      label={
                        <Group justify="space-between" gap="md" wrap="nowrap">
                          <Text size="sm">{item.label}</Text>
                          <Text size="xs" c="dimmed">
                            {formatDateTime(item.clinicalDate) || 'Date unavailable'}
                          </Text>
                        </Group>
                      }
                    />
                  ))}
                </Stack>
              ))
            )}
            <Alert color="blue">
              Required referenced resources will be imported automatically, even if they are not separately selected.
            </Alert>
            {missingVersion && (
              <Alert color="red">This Task is missing the ID or version required for an optimistic update.</Alert>
            )}
            <Group justify="space-between">
              <Button
                color="red"
                variant="outline"
                onClick={props.onDiscard}
                disabled={missingVersion || props.submitting}
              >
                Discard retrieval
              </Button>
              <Button
                onClick={props.onImport}
                disabled={props.selectedIds.length === 0 || missingVersion || props.submitting}
              >
                Import selected records
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Paper>
  );
}

function LatestTaskCard(props: { patientId: string; task: Task | undefined; loading: boolean }): JSX.Element {
  const { patientId, task, loading } = props;
  if (loading) {
    return (
      <Paper withBorder p="md">
        <Group>
          <Loader size="sm" />
          <Text size="sm">Loading latest HIE import status…</Text>
        </Group>
      </Paper>
    );
  }
  if (!task) {
    return (
      <Paper withBorder p="md">
        <Text fw={600}>Latest import</Text>
        <Text size="sm" c="dimmed" mt="xs">
          No previous Patient360 import was found for this patient.
        </Text>
      </Paper>
    );
  }

  const statusReason = task.statusReason?.text || formatCodeableConcept(task.statusReason);
  const mode = getP360Mode(task);
  const phase = getP360Phase(task);
  const ignoredCount = getP360IgnoredCount(task);
  const unsupportedCount = getP360UnsupportedCount(task);
  const selectedCount = getP360SelectedCount(task);
  const importedCount = getP360ImportedCount(task);
  const statusLabel = isSelectiveTaskAwaitingSelection(task) ? 'Awaiting selection' : formatTaskStatus(task.status);
  let modeLabel = '—';
  if (mode === 'all') {
    modeLabel = 'Import all';
  } else if (mode === 'selective') {
    modeLabel = 'Selective';
  }
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Latest import</Text>
          <Badge color={getTaskStatusColor(task.status)}>{statusLabel}</Badge>
        </Group>
        <Divider />
        <TaskDetail label="Mode" value={modeLabel} />
        <TaskDetail label="Business phase" value={phase ? formatP360Phase(phase) : '—'} />
        <TaskDetail label="Authored" value={formatDateTime(task.authoredOn) || '—'} />
        <TaskDetail label="Updated" value={formatDateTime(task.meta?.lastUpdated) || '—'} />
        {ignoredCount !== undefined && <TaskDetail label="Ignored inventory" value={String(ignoredCount)} />}
        {unsupportedCount !== undefined && (
          <TaskDetail label="Unsupported inventory" value={String(unsupportedCount)} />
        )}
        {selectedCount !== undefined && <TaskDetail label="Selected roots" value={String(selectedCount)} />}
        {importedCount !== undefined && <TaskDetail label="Imported resources" value={String(importedCount)} />}
        {statusReason && <TaskDetail label="Status reason" value={statusReason} />}
        {task.id && (
          <Button component={Link} to={`/Patient/${patientId}/Task/${task.id}`} variant="subtle" px={0} w="fit-content">
            View Task
          </Button>
        )}
      </Stack>
    </Paper>
  );
}

function TaskDetail(props: { label: string; value: string }): JSX.Element {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Text size="sm" c="dimmed">
        {props.label}
      </Text>
      <Text size="sm" ta="right">
        {props.value}
      </Text>
    </Group>
  );
}

function getTaskVersionKey(task: Task): string {
  return `${task.id ?? ''}|${task.meta?.versionId ?? ''}`;
}
