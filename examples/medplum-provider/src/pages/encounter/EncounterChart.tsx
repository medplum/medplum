// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Card, Stack, Textarea, Title } from '@mantine/core';
import { ClinicalImpression, Encounter, Practitioner, Provenance, Reference, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { JSX, useCallback, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router';
import { SAVE_TIMEOUT_MS } from '../../config/constants';
import { useEncounterChart } from '../../hooks/useEncounterChart';
import { usePatient } from '../../hooks/usePatient';
import { showErrorNotification } from '../../utils/notifications';
import { updateEncounterStatus } from '../../utils/encounter';
import { EncounterHeader } from '../../components/encounter/EncounterHeader';
import { TaskPanel } from '../../components/encountertasks/TaskPanel';
import { useDebouncedUpdateResource } from '../../hooks/useDebouncedUpdateResource';
import { BillingTab } from './BillingTab';
import { createReference, getReferenceString } from '@medplum/core';

export const EncounterChart = (): JSX.Element => {
  const { patientId, encounterId } = useParams();
  const medplum = useMedplum();
  const patient = usePatient();
  const [activeTab, setActiveTab] = useState<string>('notes');
  const {
    encounter,
    claim,
    practitioner,
    tasks,
    clinicalImpression,
    chargeItems,
    appointment,
    setEncounter,
    setClaim,
    setPractitioner,
    setTasks,
    setChargeItems,
  } = useEncounterChart(patientId, encounterId);
  const [chartNote, setChartNote] = useState<string | undefined>(clinicalImpression?.note?.[0]?.text);
  const debouncedUpdateResource = useDebouncedUpdateResource(medplum, SAVE_TIMEOUT_MS);
  const [provenance, setProvenance] = useState<Provenance | undefined>(undefined);

  useEffect(() => {
    if (!encounter) {
      return;
    }
    const fetchProvenance = async (): Promise<void> => {
      const provenance = await medplum.searchResources('Provenance', `target=${getReferenceString(encounter)}`);
      setProvenance(provenance[0]);
    };
    fetchProvenance().catch((err) => showErrorNotification(err));
  }, [encounter, medplum]);

  const updateTaskList = useCallback(
    (updatedTask: Task): void => {
      setTasks(tasks.map((task) => (task.id === updatedTask.id ? updatedTask : task)));
    },
    [tasks, setTasks]
  );

  const handleEncounterStatusChange = useCallback(
    async (newStatus: Encounter['status']): Promise<void> => {
      if (!encounter) {
        return;
      }
      try {
        const updatedEncounter = await updateEncounterStatus(medplum, encounter, appointment, newStatus);
        setEncounter(updatedEncounter);
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [encounter, medplum, setEncounter, appointment]
  );

  const handleTabChange = (tab: string): void => {
    setActiveTab(tab);
  };

  const handleChartNoteChange = async (e: React.ChangeEvent<HTMLTextAreaElement>): Promise<void> => {
    setChartNote(e.target.value);

    if (!clinicalImpression) {
      return;
    }

    try {
      if (!e.target.value || e.target.value === '') {
        const { note: _, ...restOfClinicalImpression } = clinicalImpression;
        const updatedClinicalImpression: ClinicalImpression = restOfClinicalImpression;
        await debouncedUpdateResource(updatedClinicalImpression);
      } else {
        const updatedClinicalImpression: ClinicalImpression = {
          ...clinicalImpression,
          note: [{ text: e.target.value }],
        };
        await debouncedUpdateResource(updatedClinicalImpression);
      }
    } catch (err) {
      showErrorNotification(err);
    }
  };

  const handleSign = async (practitioner: Reference<Practitioner>): Promise<void> => {
    if (!encounter) {
      return;
    }

    const eligibleStatuses = new Set(['completed', 'cancelled', 'failed', 'rejected', 'entered-in-error']);

    const tasksToUpdate = tasks.filter((task) => !eligibleStatuses.has(task.status));

    const updatedTasks = await Promise.all(
      tasksToUpdate.map((task) =>
        medplum.updateResource({
          ...task,
          status: 'completed',
        })
      )
    );

    setTasks(
      tasks.map((task) => {
        const updated = updatedTasks.find((t) => t.id === task.id);
        return updated || task;
      })
    );

    const newProvenance = await medplum.createResource({
      resourceType: 'Provenance',
      target: [createReference(encounter)],
      recorded: new Date().toISOString(),
      reason: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActReason',
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
                system: 'http://terminology.hl7.org/CodeSystem/provenance-participant-type',
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
              system: 'http://terminology.hl7.org/CodeSystem/v3-DocumentCompletion',
              code: 'LA',
              display: 'legally authenticated',
            },
          ],
          when: new Date().toISOString(),
          who: practitioner,
        },
      ],
    });

    setProvenance(newProvenance);
  };

  if (!patient || !encounter) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader
          encounter={encounter}
          signed={provenance !== undefined}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
          onTabChange={handleTabChange}
          onSign={handleSign}
        />

        <Box p="md">
          {activeTab === 'notes' && (
            <Stack gap="md">
              {clinicalImpression && (
                <Card withBorder shadow="sm" mt="md">
                  <Title>Fill chart note</Title>
                  <Textarea
                    defaultValue={clinicalImpression.note?.[0]?.text}
                    value={chartNote}
                    onChange={handleChartNoteChange}
                    autosize
                    minRows={4}
                    maxRows={8}
                    disabled={provenance !== undefined}
                  />
                </Card>
              )}

              {tasks.map((task: Task) => (
                <TaskPanel key={task.id} task={task} onUpdateTask={updateTaskList} enabled={provenance === undefined} />
              ))}
            </Stack>
          )}

          {activeTab === 'details' && (
            <BillingTab
              encounter={encounter}
              setEncounter={setEncounter}
              claim={claim}
              patient={patient}
              practitioner={practitioner}
              setPractitioner={setPractitioner}
              chargeItems={chargeItems}
              setChargeItems={setChargeItems}
              setClaim={setClaim}
            />
          )}
        </Box>
      </Stack>
      <Outlet />
    </>
  );
};
