// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack, Textarea } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { showNotification } from '@mantine/notifications';
import type { WithId } from '@medplum/core';
import { createReference, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Encounter, Practitioner, Provenance, Reference, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { ChartNoteStatus } from '../../types/encounter';
import { updateEncounterStatus } from '../../utils/encounter';
import { showErrorNotification } from '../../utils/notifications';
import { DetailSection } from '../billing/DetailSection';
import { createVisitClaimOnSign } from '../billing/visitClaim';
import { TaskDetailsModal } from '../tasks/TaskDetailsModal';
import { TaskPanel } from '../tasks/encounter/TaskPanel';
import { BillingTab } from './BillingTab';
import { EncounterHeader } from './EncounterHeader';
import { SignAddendum } from './SignAddendum';

const FHIR_ACT_REASON_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActReason';
const FHIR_PROVENANCE_PARTICIPANT_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/provenance-participant-type';
const FHIR_DOCUMENT_COMPLETION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion';

const TASK_COMPLETED_STATUSES = new Set<Task['status']>([
  'completed',
  'cancelled',
  'failed',
  'rejected',
  'entered-in-error',
]);

export interface EncounterChartProps {
  encounter: WithId<Encounter> | Reference<Encounter>;
  task?: WithId<Task> | Reference<Task>;
  onEncounterChange?: (encounter: WithId<Encounter>) => void;
}

export const EncounterChart = (props: EncounterChartProps): JSX.Element => {
  const { encounter: encounterProp, task: taskProp, onEncounterChange } = props;
  const medplum = useMedplum();

  const [activeTab, setActiveTab] = useState('notes');
  const {
    encounter,
    patient: patientResource,
    practitioner,
    tasks,
    clinicalImpression,
    appointment,
    setEncounter,
    setPractitioner,
    setTasks,
    setClinicalImpression,
  } = useEncounterChart(encounterProp);

  const [chartNote, setChartNote] = useState(clinicalImpression?.note?.[0]?.text);
  const [provenances, setProvenances] = useState<Provenance[]>([]);
  // Bumped when the visit's claims change outside the Billing tab, e.g. made on signing, so it reloads them.
  const [claimsKey, setClaimsKey] = useState(0);
  const [chartNoteStatus, setChartNoteStatus] = useState(ChartNoteStatus.Unsigned);

  useEffect(() => {
    if (!encounter) {
      return;
    }

    const fetchProvenance = async (): Promise<void> => {
      const provenance = await medplum.searchResources('Provenance', `target=${getReferenceString(encounter)}`);
      setProvenances(provenance);
      if (provenance.length > 0 && clinicalImpression?.status === 'completed') {
        setChartNoteStatus(ChartNoteStatus.SignedAndLocked);
      } else if (provenance.length > 0) {
        setChartNoteStatus(ChartNoteStatus.Signed);
      } else {
        setChartNoteStatus(ChartNoteStatus.Unsigned);
      }
    };

    fetchProvenance().catch((err) => showErrorNotification(err));
  }, [clinicalImpression, encounter, medplum]);

  const updateTaskList = useCallback(
    (updatedTask: WithId<Task>): void => {
      setTasks((prevTasks) => prevTasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [setTasks]
  );

  const handleEncounterStatusChange = useCallback(
    async (newStatus: Encounter['status']): Promise<void> => {
      if (!encounter) {
        return;
      }

      try {
        const updatedEncounter = await updateEncounterStatus(medplum, encounter, appointment, newStatus);
        setEncounter(updatedEncounter);
        onEncounterChange?.(updatedEncounter);
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [encounter, medplum, setEncounter, onEncounterChange, appointment]
  );

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
  };

  // Whether the server copy currently has a note; `clinicalImpression` state is not refreshed on
  // note saves, so this decides between add and remove when the note is cleared.
  const noteOnServerRef = useRef<boolean | undefined>(undefined);

  const debouncedPatchChartNote = useDebouncedCallback(async (note: string): Promise<void> => {
    if (!clinicalImpression) {
      return;
    }

    try {
      if (note) {
        await medplum.patchResource('ClinicalImpression', clinicalImpression.id, [
          { op: 'add', path: '/note', value: [{ text: note }] },
        ]);
        noteOnServerRef.current = true;
      } else if (noteOnServerRef.current ?? Boolean(clinicalImpression.note)) {
        await medplum.patchResource('ClinicalImpression', clinicalImpression.id, [{ op: 'remove', path: '/note' }]);
        noteOnServerRef.current = false;
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, SAVE_TIMEOUT_MS);

  const handleChartNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    setChartNote(e.target.value);

    if (!clinicalImpression) {
      return;
    }

    debouncedPatchChartNote(e.target.value);
  };

  const handleSign = async (practitioner: Reference<Practitioner>, lock: boolean): Promise<void> => {
    if (!encounter) {
      return;
    }

    if (lock) {
      // Complete all incomplete tasks
      const tasksToUpdate = tasks.filter((task) => !TASK_COMPLETED_STATUSES.has(task.status));
      const updatedTasks = await Promise.all(
        tasksToUpdate.map((task) =>
          medplum.patchResource('Task', task.id, [{ op: 'replace', path: '/status', value: 'completed' }])
        )
      );

      setTasks(
        tasks.map((task) => {
          const updated = updatedTasks.find((t) => t.id === task.id);
          return updated || task;
        })
      );

      // Mark clinical impression as completed
      if (clinicalImpression) {
        const updatedImpression = await medplum.patchResource('ClinicalImpression', clinicalImpression.id, [
          { op: 'replace', path: '/status', value: 'completed' },
        ]);
        setClinicalImpression(updatedImpression);
      }
    }

    // Create provenance record with signature
    const newProvenance = await medplum.createResource<Provenance>({
      resourceType: 'Provenance',
      target: [createReference(encounter)],
      recorded: new Date().toISOString(),
      reason: [
        {
          coding: [
            {
              system: FHIR_ACT_REASON_SYSTEM,
              code: 'SIGN',
              display: 'Signed',
            },
          ],
        },
      ],
      agent: [
        {
          type: {
            coding: [
              {
                system: FHIR_PROVENANCE_PARTICIPANT_TYPE_SYSTEM,
                code: 'author',
              },
            ],
          },
          who: practitioner,
        },
      ],
      signature: [
        {
          type: [
            {
              system: FHIR_DOCUMENT_COMPLETION_SYSTEM,
              code: 'LA',
              display: 'legally authenticated',
            },
          ],
          when: new Date().toISOString(),
          who: practitioner,
        },
      ],
    });

    setProvenances([...provenances, newProvenance]);

    if (lock) {
      setChartNoteStatus(ChartNoteStatus.SignedAndLocked);
      // The visit's claim is made now, so the visit shows up in Billing; signing doesn't wait on it or fail with it.
      if (patientResource) {
        createVisitClaimOnSign(medplum, patientResource, encounter, practitioner)
          .then((claim) => {
            if (claim) {
              setClaimsKey((k) => k + 1);
              showNotification({ color: 'green', title: 'Claim created', message: 'The visit is ready for billing.' });
            }
          })
          .catch((err) =>
            showNotification({
              color: 'red',
              title: 'Signed, but the claim wasn’t made',
              message: `${normalizeErrorString(err)}. It’s made when you export or submit it from Billing & Details.`,
            })
          );
      }
    } else {
      setChartNoteStatus(ChartNoteStatus.Signed);
    }
  };

  if (!patientResource || !encounter) {
    return <Loading />;
  }

  return (
    <>
      <Stack gap={0} bg="var(--mantine-color-body)" mih="100%">
        <EncounterHeader
          encounter={encounter}
          chartNoteStatus={chartNoteStatus}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
          onTabChange={handleTabChange}
          onSign={handleSign}
        />
        <Stack gap="md" p="md">
          {activeTab === 'billing' && (
            <BillingTab
              encounter={encounter}
              setEncounter={setEncounter}
              onEncounterSaved={onEncounterChange}
              patient={patientResource}
              practitioner={practitioner}
              setPractitioner={setPractitioner}
              chartNoteStatus={chartNoteStatus}
              claimsKey={claimsKey}
            />
          )}
          {activeTab === 'notes' && (
            <>
              <SignAddendum encounter={encounter} provenances={provenances} chartNoteStatus={chartNoteStatus} />

              {clinicalImpression && (
                <DetailSection gap="sm" title="Chart Note">
                  <Textarea
                    defaultValue={clinicalImpression.note?.[0]?.text}
                    value={chartNote}
                    onChange={handleChartNoteChange}
                    autosize
                    minRows={4}
                    maxRows={8}
                    disabled={chartNoteStatus === ChartNoteStatus.SignedAndLocked}
                  />
                </DetailSection>
              )}
              {tasks.map((task) => (
                <TaskPanel
                  key={task.id}
                  task={task}
                  onUpdateTask={updateTaskList}
                  enabled={chartNoteStatus !== ChartNoteStatus.SignedAndLocked}
                />
              ))}
            </>
          )}
        </Stack>
      </Stack>
      {taskProp && (
        <TaskDetailsModal key={getReferenceString(taskProp)} task={taskProp} onUpdateTask={updateTaskList} />
      )}
    </>
  );
};
