// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Badge, Button, Group, Modal, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { resolveId } from '@medplum/core';
import type { MedicationRequest, Task, TaskInput } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { SCRIPTSURE_PATIENT_SYNC_BOT, useScriptSureMessageTask } from '@medplum/scriptsure-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { OrderMedicationPage } from '../../pages/meds/OrderMedicationPage';
import { useScriptSurePractice } from '../../scriptsure/ScriptSurePractice';
import { showErrorNotification } from '../../utils/notifications';
import { PrescriptionIFrameModal } from '../meds/PrescriptionIFrameModal';
import {
  ensureReplacementMedicationRequest,
  isScriptSureMessageTask,
  isScriptSureNewRxErrorTask,
} from './ScriptSureMessageTaskActions.utils';

interface ScriptSureMessageTaskActionsProps {
  task: Task;
  onTaskChange: (task: Task) => void;
}

const INPUT_LABELS: Readonly<Record<string, string>> = {
  messageRequestCode: 'Request code',
  messageStatus: 'Message status',
  messageResponse: 'Pharmacy response',
  pharmacyNote: 'Pharmacy note',
  drugName: 'Medication',
  quantity: 'Quantity',
  instruction: 'Directions',
  ncpdpId: 'NCPDP ID',
  pharmacy: 'Pharmacy',
};

function inputName(input: TaskInput): string | undefined {
  return input.type?.text ?? input.type?.coding?.[0]?.code;
}

function displayInputs(task: Task): { name: string; label: string; value: string }[] {
  return (task.input ?? [])
    .map((input) => {
      const name = inputName(input);
      const value = input.valueString;
      return name && value ? { name, label: INPUT_LABELS[name] ?? name, value } : undefined;
    })
    .filter((row): row is { name: string; label: string; value: string } => Boolean(row));
}

function getMedicationRequestHref(
  focusedMedicationRequestId: string | undefined,
  patientId: string | undefined
): string | undefined {
  if (!focusedMedicationRequestId) {
    return undefined;
  }
  if (patientId) {
    return `/Patient/${patientId}/MedicationRequest/${focusedMedicationRequestId}`;
  }
  return `/MedicationRequest/${focusedMedicationRequestId}`;
}

/**
 * ScriptSure-only pharmacy-message actions for a FHIR Task.
 *
 * Generic Tasks render nothing and retain the existing detail behavior.
 *
 * @param props - Task and parent update callback.
 * @returns ScriptSure message context and actions, or null for other Tasks.
 */
export function ScriptSureMessageTaskActions(props: ScriptSureMessageTaskActionsProps): JSX.Element | null {
  const { task, onTaskChange } = props;
  const medplum = useMedplum();
  const { selectedOrganizationId } = useScriptSurePractice();
  const { launch, reconcile, acknowledge } = useScriptSureMessageTask();
  const [activeAction, setActiveAction] = useState<'launch' | 'reconcile' | 'acknowledge' | 'replace'>();
  const [messageLaunchUrl, setMessageLaunchUrl] = useState<string>();
  const [messageModalOpened, setMessageModalOpened] = useState(false);
  const [replacementDraft, setReplacementDraft] = useState<WithId<MedicationRequest>>();
  const [replacementEditorOpened, setReplacementEditorOpened] = useState(false);
  const [replacementLaunchUrl, setReplacementLaunchUrl] = useState<string>();
  const [replacementId, setReplacementId] = useState<string>();
  const [replacementModalOpened, setReplacementModalOpened] = useState(false);

  if (!isScriptSureMessageTask(task)) {
    return null;
  }

  const taskId = task.id;
  const contextRows = displayInputs(task);
  const focusedMedicationRequestId = task.focus?.reference?.startsWith('MedicationRequest/')
    ? resolveId(task.focus)
    : undefined;
  const patientId = resolveId(task.for);
  const medicationRequestHref = getMedicationRequestHref(focusedMedicationRequestId, patientId);

  const executeForTask = async (
    action: 'launch' | 'reconcile' | 'acknowledge'
  ): Promise<Awaited<ReturnType<typeof launch>>> => {
    if (!taskId) {
      throw new Error('The ScriptSure message Task must be saved before it can be acted on');
    }
    const params = { taskId, organizationId: selectedOrganizationId };
    switch (action) {
      case 'launch':
        return launch(params);
      case 'reconcile':
        return reconcile(params);
      case 'acknowledge':
        return acknowledge(params);
      default: {
        const exhaustive: never = action;
        throw new Error(`Unsupported ScriptSure message Task action: ${exhaustive}`);
      }
    }
  };

  const handleLaunch = async (): Promise<void> => {
    setActiveAction('launch');
    try {
      const response = await executeForTask('launch');
      if (!response.launchUrl) {
        throw new Error('ScriptSure did not return a Messages widget URL');
      }
      onTaskChange(response.task);
      setMessageLaunchUrl(response.launchUrl);
      setMessageModalOpened(true);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setActiveAction(undefined);
    }
  };

  const handleMessageClose = async (): Promise<void> => {
    setMessageModalOpened(false);
    setActiveAction('reconcile');
    try {
      if (patientId) {
        await medplum.executeBot(SCRIPTSURE_PATIENT_SYNC_BOT, {
          patientId,
          organizationId: selectedOrganizationId,
        });
      }
      const response = await executeForTask('reconcile');
      onTaskChange(response.task);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setActiveAction(undefined);
      setMessageLaunchUrl(undefined);
    }
  };

  const handleAcknowledge = async (): Promise<void> => {
    setActiveAction('acknowledge');
    try {
      const response = await executeForTask('acknowledge');
      onTaskChange(response.task);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setActiveAction(undefined);
    }
  };

  const handleRePrescribe = async (): Promise<void> => {
    setActiveAction('replace');
    try {
      const result = await ensureReplacementMedicationRequest(medplum, task);
      const replacement = result.medicationRequest;
      if (!replacement.id) {
        throw new Error('The replacement MedicationRequest was not saved');
      }
      if (replacement.status === 'active') {
        const response = await executeForTask('reconcile');
        onTaskChange(response.task);
        return;
      }
      if (replacement.status !== 'draft' && replacement.status !== 'unknown') {
        throw new Error(`Replacement MedicationRequest is not editable in status ${replacement.status ?? 'unknown'}`);
      }
      setReplacementDraft(replacement);
      setReplacementEditorOpened(true);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setActiveAction(undefined);
    }
  };

  const handleReplacementOrderComplete = (result: { launchUrl: string; medicationRequestId?: string }): void => {
    setReplacementEditorOpened(false);
    setReplacementId(result.medicationRequestId ?? replacementDraft?.id);
    setReplacementLaunchUrl(result.launchUrl);
    setReplacementModalOpened(true);
  };

  const handleReplacementSynced = async (): Promise<void> => {
    setReplacementModalOpened(false);
    setActiveAction('reconcile');
    try {
      const response = await executeForTask('reconcile');
      onTaskChange(response.task);
    } catch (error) {
      showErrorNotification(error);
    } finally {
      setActiveAction(undefined);
      setReplacementLaunchUrl(undefined);
      setReplacementId(undefined);
      setReplacementDraft(undefined);
    }
  };

  const vendorStatusCoding = task.businessStatus?.coding?.find(
    (coding) => coding.system === 'https://scriptsure.com/message-status'
  );
  const vendorStatus =
    task.businessStatus?.text ?? vendorStatusCoding?.display ?? task.businessStatus?.coding?.[0]?.code;
  const isOpenTask = !['completed', 'cancelled', 'rejected', 'failed', 'entered-in-error'].includes(task.status);
  const supportsErrorAcknowledgment = isOpenTask && isScriptSureNewRxErrorTask(task);
  const supportsRePrescribing = supportsErrorAcknowledgment && Boolean(focusedMedicationRequestId);

  return (
    <>
      <Paper m="md" mb={0} p="md" withBorder>
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>Pharmacy message</Text>
            {vendorStatus && (
              <Badge color={vendorStatusCoding?.code === 'Error' ? 'red' : 'blue'}>{vendorStatus}</Badge>
            )}
          </Group>

          {contextRows.length > 0 && (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {contextRows.map((row) => (
                <Stack key={row.name} gap={0}>
                  <Text size="xs" c="dimmed">
                    {row.label}
                  </Text>
                  <Text size="sm">{row.value}</Text>
                </Stack>
              ))}
            </SimpleGrid>
          )}

          {medicationRequestHref && (
            <Anchor href={medicationRequestHref} size="sm">
              View affected MedicationRequest
            </Anchor>
          )}

          <Group>
            <Button onClick={() => handleLaunch().catch(showErrorNotification)} loading={activeAction === 'launch'}>
              Open ScriptSure patient Messages
            </Button>
            {supportsRePrescribing && (
              <Button
                variant="light"
                onClick={() => handleRePrescribe().catch(showErrorNotification)}
                loading={activeAction === 'replace'}
              >
                Re-prescribe
              </Button>
            )}
            {supportsErrorAcknowledgment && (
              <Button
                variant="default"
                onClick={() => handleAcknowledge().catch(showErrorNotification)}
                loading={activeAction === 'acknowledge'}
              >
                Acknowledge error
              </Button>
            )}
          </Group>
        </Stack>
      </Paper>

      <PrescriptionIFrameModal
        opened={messageModalOpened}
        onClose={() => handleMessageClose().catch(showErrorNotification)}
        launchUrl={messageLaunchUrl}
        title="ScriptSure patient Messages"
      />
      <Modal
        opened={replacementEditorOpened}
        onClose={() => setReplacementEditorOpened(false)}
        size="xl"
        centered
        title="Edit replacement prescription"
      >
        {replacementDraft && (
          <OrderMedicationPage
            key={replacementDraft.id}
            replacementMedicationRequest={replacementDraft}
            onOrderComplete={handleReplacementOrderComplete}
          />
        )}
      </Modal>
      <PrescriptionIFrameModal
        opened={replacementModalOpened}
        onClose={() => setReplacementModalOpened(false)}
        launchUrl={replacementLaunchUrl}
        title="Review replacement prescription"
        medicationRequestIdsToWatch={replacementId ? [replacementId] : []}
        onFhirSynced={() => handleReplacementSynced().catch(showErrorNotification)}
      />
    </>
  );
}
