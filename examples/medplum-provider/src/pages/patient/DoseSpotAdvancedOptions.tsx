// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Group, Modal, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PATIENT_SYNC_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
} from '@medplum/dosespot-react';
import { useMedplum } from '@medplum/react-hooks';
import { IconSettings } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';

export function DoseSpotAdvancedOptions({ patientId }: { patientId: string }): JSX.Element {
  const medplum = useMedplum();
  const [prescriptionStartDate, setPrescriptionStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [prescriptionEndDate, setPrescriptionEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyStartDate, setHistoryStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyEndDate, setHistoryEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const syncPrescriptions = useCallback(async () => {
    if (!prescriptionStartDate || !prescriptionEndDate) {
      showNotification({ color: 'red', title: 'Error', message: 'Please select both start and end dates' });
      return;
    }

    try {
      await medplum.executeBot(DOSESPOT_PRESCRIPTIONS_SYNC_BOT, {
        patientId,
        start: prescriptionStartDate,
        end: prescriptionEndDate,
      });
      showNotification({ color: 'green', title: 'Success', message: 'Prescriptions synced successfully' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patientId, prescriptionStartDate, prescriptionEndDate]);

  const syncHistory = useCallback(async () => {
    try {
      await medplum.executeBot(DOSESPOT_MEDICATION_HISTORY_BOT, {
        patientId,
        start: historyStartDate,
        end: historyEndDate,
      });
      showNotification({ color: 'green', title: 'Success', message: 'History synced successfully' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patientId, historyStartDate, historyEndDate]);

  const syncPatient = useCallback(async () => {
    try {
      await medplum.executeBot(DOSESPOT_PATIENT_SYNC_BOT, {
        patientId,
      });
      showNotification({ color: 'green', title: 'Success', message: 'Patient sync success' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    }
  }, [medplum, patientId]);

  return (
    <>
      <Group style={{ position: 'absolute', top: 8, right: 8, zIndex: 100 }}>
        <Button variant="subtle" size="sm" onClick={() => setShowAdvanced(true)}>
          <IconSettings size={16} style={{ marginRight: 8 }} />
          Advanced Options
        </Button>
      </Group>

      <Modal
        opened={showAdvanced}
        onClose={() => setShowAdvanced(false)}
        size="lg"
        title="Advanced DoseSpot Options"
        styles={{
          title: {
            fontSize: '1.5rem',
            fontWeight: 600,
          },
        }}
      >
        <Box>
          <Stack>
            <Box>
              <Text mb="sm">Prescriptions Sync</Text>
              <Text c="dimmed" mb="md">
                Fetches recently completed and active prescriptions from DoseSpot for the specified date range and
                patient. This will create or update MedicationRequest resources.
              </Text>
              <Group align="flex-end">
                <TextInput
                  label="Start Date"
                  type="date"
                  value={prescriptionStartDate}
                  onChange={(e) => setPrescriptionStartDate(e.target.value)}
                />
                <TextInput
                  label="End Date"
                  type="date"
                  value={prescriptionEndDate}
                  onChange={(e) => setPrescriptionEndDate(e.target.value)}
                />
                <Button onClick={syncPrescriptions}>Sync Prescriptions</Button>
              </Group>
            </Box>

            <Box mt="md">
              <Text mb="sm">Medication History Sync</Text>
              <Text c="dimmed" mb="md">
                Retrieves medication history from DoseSpot for this patient and adds MedicationRequest resources to
                Medplum.
              </Text>
              <Group align="flex-end">
                <TextInput
                  label="Start Date"
                  type="date"
                  value={historyStartDate}
                  onChange={(e) => setHistoryStartDate(e.target.value)}
                />
                <TextInput
                  label="End Date"
                  type="date"
                  value={historyEndDate}
                  onChange={(e) => setHistoryEndDate(e.target.value)}
                />
                <Button onClick={syncHistory}>Sync History</Button>
              </Group>
            </Box>

            <Box mt="md">
              <Text mb="sm">Patient Information Sync</Text>
              <Text c="dimmed" mb="md">
                Syncs patient between Medplum and DoseSpot. It creates an identifier for the patient in Medplum to link
                it to the patient's record in DoseSpot. It also adds MedicationRequest and AllergyIntolerance resources
                from Medplum to that patient's record in DoseSpot.
              </Text>
              <Button onClick={syncPatient}>Sync Patient</Button>
            </Box>
          </Stack>
        </Box>
      </Modal>
    </>
  );
}
