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
import type { OperationOutcome, Task } from '@medplum/fhirtypes';
import { Document, OperationOutcomeAlert, useMedplum, useSubscription } from '@medplum/react';
import { IconAlertCircle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router';
import type { HealthGorillaHieImportEligibility } from '../../hooks/useHealthGorillaHieImportEligibility';
import {
  formatTaskStatus,
  getImportButtonLabel,
  getTaskStatusColor,
  HEALTH_GORILLA_HIE_P360_OPERATION,
  HEALTH_GORILLA_HIE_P360_TASK_CODE,
  HIE_TASK_POLL_INTERVAL_MS,
  isImportDisabled,
  isTerminalTask,
} from './HieImportTab.utils';

interface HieImportOutletContext {
  hieImportEligibility: HealthGorillaHieImportEligibility;
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
  const [operationOutcome, setOperationOutcome] = useState<OperationOutcome>();
  const [consentOpened, setConsentOpened] = useState(false);
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [awaitingTask, setAwaitingTask] = useState(false);
  const submittingRef = useRef(false);
  const taskRefreshGenerationRef = useRef(0);

  const refreshLatestTask = useCallback(async (): Promise<void> => {
    const generation = ++taskRefreshGenerationRef.current;
    try {
      const tasks = await medplum.searchResources(
        'Task',
        new URLSearchParams({
          patient: `Patient/${patientId}`,
          code: HEALTH_GORILLA_HIE_P360_TASK_CODE,
          _sort: '-_lastUpdated',
          _count: '1',
        }),
        { cache: 'reload' }
      );
      if (generation === taskRefreshGenerationRef.current) {
        setLatestTask(tasks[0]);
        if (tasks[0]) {
          setAwaitingTask(false);
        }
        setTaskOutcome(undefined);
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

  const subscriptionCriteria = `Task?patient=Patient/${patientId}&code=${encodeURIComponent(
    HEALTH_GORILLA_HIE_P360_TASK_CODE
  )}`;
  useSubscription(subscriptionCriteria, () => {
    refreshLatestTask().catch(console.error);
  });

  useEffect(() => {
    if (!awaitingTask && (!latestTask || isTerminalTask(latestTask))) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      refreshLatestTask().catch(console.error);
    }, HIE_TASK_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [awaitingTask, latestTask, refreshLatestTask]);

  const openConsent = (): void => {
    setAttested(false);
    setConsentOpened(true);
  };

  const closeConsent = (): void => {
    if (!submittingRef.current) {
      setAttested(false);
      setConsentOpened(false);
    }
  };

  const confirmImport = async (): Promise<void> => {
    if (!attested || submittingRef.current || isImportDisabled(latestTask, taskLoading, taskOutcome)) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setOperationOutcome(undefined);
    try {
      const outcome = await medplum.post<OperationOutcome>(
        medplum.fhirUrl('Patient', patientId, HEALTH_GORILLA_HIE_P360_OPERATION),
        {}
      );
      setOperationOutcome(outcome);
      if (isOk(outcome)) {
        setAwaitingTask(true);
      }
      await refreshLatestTask();
    } catch (err) {
      setOperationOutcome(normalizeOperationOutcome(err));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setAttested(false);
      setConsentOpened(false);
    }
  };

  const importDisabled = isImportDisabled(latestTask, taskLoading, taskOutcome) || submitting;

  return (
    <Document maw={700}>
      <Stack gap="lg">
        <div>
          <Title order={2}>Health Gorilla HIE Import</Title>
          <Text c="dimmed" mt="xs">
            This patient has a Health Gorilla record and is eligible for HIE synchronization.
          </Text>
        </div>

        <Alert icon={<IconInfoCircle size={16} />} color="blue" title="Production network request">
          Each confirmed import starts a metered Patient360 network request. Imported records arrive asynchronously.
        </Alert>

        {operationOutcome && isOk(operationOutcome) ? (
          <Alert icon={<IconCircleCheck size={16} />} color="green" title="HIE import request accepted">
            {operationOutcome.issue.map(operationOutcomeIssueToString).join(' ')}
          </Alert>
        ) : (
          operationOutcome && <OperationOutcomeAlert outcome={operationOutcome} title="HIE import request failed" />
        )}
        {taskOutcome && <OperationOutcomeAlert outcome={taskOutcome} title="Latest HIE import status unavailable" />}

        <LatestTaskCard patientId={patientId} task={latestTask} loading={taskLoading} />

        <Group>
          <Button onClick={openConsent} disabled={importDisabled} loading={submitting}>
            {getImportButtonLabel(latestTask)}
          </Button>
          {latestTask && !isTerminalTask(latestTask) && (
            <Text size="sm" c="dimmed">
              Another import cannot start while the latest request is {formatTaskStatus(latestTask.status)}.
            </Text>
          )}
        </Group>
      </Stack>

      <Modal
        opened={consentOpened}
        onClose={closeConsent}
        title="Confirm Health Gorilla HIE import"
        centered
        closeOnClickOutside={!submitting}
        closeOnEscape={!submitting}
        withCloseButton={!submitting}
      >
        <Stack gap="md">
          <Text size="sm">
            Confirm that this Patient360 retrieval is authorized for this patient and the permitted treatment purpose.
          </Text>
          <Checkbox
            checked={attested}
            disabled={submitting}
            onChange={(event) => setAttested(event.currentTarget.checked)}
            label="I attest that this HIE retrieval is authorized for treatment of this patient."
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeConsent} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => confirmImport().catch(console.error)}
              disabled={!attested || submitting}
              loading={submitting}
            >
              Confirm and import
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Document>
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
  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Text fw={600}>Latest import</Text>
          <Badge color={getTaskStatusColor(task.status)}>{formatTaskStatus(task.status)}</Badge>
        </Group>
        <Divider />
        <TaskDetail label="Authored" value={formatDateTime(task.authoredOn) || '—'} />
        <TaskDetail label="Updated" value={formatDateTime(task.meta?.lastUpdated) || '—'} />
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
