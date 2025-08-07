// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Card, Stack, Textarea, Title } from '@mantine/core';
import { ClinicalImpression, Encounter, Task } from '@medplum/fhirtypes';
import { Loading, useMedplum } from '@medplum/react';
import { JSX, useCallback, useState } from 'react';
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

  if (!patient || !encounter) {
    return <Loading />;
  }

  return (
    <>
      <Stack justify="space-between" gap={0}>
        <EncounterHeader
          encounter={encounter}
          practitioner={practitioner}
          onStatusChange={handleEncounterStatusChange}
          onTabChange={handleTabChange}
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
                  />
                </Card>
              )}

              {tasks.map((task: Task) => (
                <TaskPanel key={task.id} task={task} onUpdateTask={updateTaskList} />
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
