import { Box, Button, Group, Modal, Stack, Text, TextInput, Divider } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getIdentifier, normalizeErrorString } from '@medplum/core';
import {
  DOSESPOT_MEDICATION_HISTORY_BOT,
  DOSESPOT_PRESCRIPTIONS_SYNC_BOT,
  DOSESPOT_ADD_FAVORITE_MEDICATION_BOT,
  DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM,
} from '@medplum/dosespot-react';
import { useMedplum } from '@medplum/react-hooks';
import { ValueSetAutocomplete } from '@medplum/react';
import { IconSettings } from '@tabler/icons-react';
import { JSX, useCallback, useState } from 'react';

interface FormValues {
  medication: any;
  dosageDirections: string;
}

interface FormErrors {
  medication?: string;
  dosageDirections?: string;
}

export function DoseSpotAdvancedOptions({ patientId }: { patientId: string }): JSX.Element {
  const medplum = useMedplum();
  
  // Calculate one year ago date
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const oneYearAgoString = oneYearAgo.toISOString().split('T')[0];
  
  const [prescriptionStartDate, setPrescriptionStartDate] = useState<string>(oneYearAgoString);
  const [prescriptionEndDate, setPrescriptionEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [historyStartDate, setHistoryStartDate] = useState<string>(oneYearAgoString);
  const [historyEndDate, setHistoryEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSyncingPrescriptions, setIsSyncingPrescriptions] = useState(false);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [isAddingFavorite, setIsAddingFavorite] = useState(false);

  // Form state
  const [formValues, setFormValues] = useState<FormValues>({
    medication: null,
    dosageDirections: '',
  });

  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const resetForm = (): void => {
    setFormValues({
      medication: null,
      dosageDirections: '',
    });
    setFormErrors({});
  };

  const syncPrescriptions = useCallback(async () => {
    if (!prescriptionStartDate || !prescriptionEndDate) {
      showNotification({ color: 'red', title: 'Error', message: 'Please select both start and end dates' });
      return;
    }

    setIsSyncingPrescriptions(true);
    try {
      await medplum.executeBot(DOSESPOT_PRESCRIPTIONS_SYNC_BOT, {
        patientId,
        start: prescriptionStartDate,
        end: prescriptionEndDate,
      });
      showNotification({ color: 'green', title: 'Success', message: 'Prescriptions synced successfully' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setIsSyncingPrescriptions(false);
    }
  }, [medplum, patientId, prescriptionStartDate, prescriptionEndDate]);

  const syncHistory = useCallback(async () => {
    setIsSyncingHistory(true);
    try {
      await medplum.executeBot(DOSESPOT_MEDICATION_HISTORY_BOT, {
        patientId,
        start: historyStartDate,
        end: historyEndDate,
      });
      showNotification({ color: 'green', title: 'Success', message: 'History synced successfully' });
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setIsSyncingHistory(false);
    }
  }, [medplum, patientId, historyStartDate, historyEndDate]);

  const addFavoriteMedication = useCallback(async () => {
    // Validate form
    const errors: FormErrors = {};
    
    if (!formValues.medication) {
      errors.medication = 'Medication is required';
    }
    if (!formValues.dosageDirections) {
      errors.dosageDirections = 'Dosage directions are required';
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsAddingFavorite(true);
    try {
      // Create an ActivityDefinition for the selected medication
      const activityDefinition = await medplum.createResource({
        resourceType: 'ActivityDefinition',
        status: 'active',
        kind: 'MedicationRequest',
        productCodeableConcept: {
          text: formValues.medication.display,
          coding: [
            {
              system: 'http://www.nlm.nih.gov/research/umls/rxnorm',
              code: formValues.medication.code,
              display: formValues.medication.display,
            },
          ],
        },
        dosage: formValues.dosageDirections ? [
          {
            text: formValues.dosageDirections,
          },
        ] : undefined,
      });

      // Execute the bot with the ActivityDefinition as the input
      const activityDefinitionResponse = await medplum.executeBot(DOSESPOT_ADD_FAVORITE_MEDICATION_BOT, activityDefinition);
      
      if (getIdentifier(activityDefinitionResponse, DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM)) {
        showNotification({ color: 'green', title: 'Success', message: 'Favorite medication added successfully' });
        resetForm();
      } else {
        showNotification({ color: 'yellow', title: 'Warning', message: 'This Medication was not found by DoseSpot' });
      }
    } catch (err) {
      showNotification({ color: 'red', title: 'Error', message: normalizeErrorString(err) });
    } finally {
      setIsAddingFavorite(false);
    }
  }, [medplum, formValues]);

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
        size="xl"
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
                <Text size="lg" fw={600} mb="sm">Prescriptions Sync</Text>
              <Text c="dimmed" mb="md">
                Fetches recently completed and active prescriptions from DoseSpot for the specified date range and patient.
              </Text>
              <Group align="flex-end" justify="flex-start" gap="md">
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
                <Button 
                  onClick={syncPrescriptions} 
                  loading={isSyncingPrescriptions}
                  disabled={isSyncingPrescriptions}
                >
                  Sync Prescriptions
                </Button>
              </Group>
            </Box>

            <Divider my="lg" />

            <Box>
              <Text size="lg" fw={600} mb="sm">Medication History Sync</Text>
              <Text c="dimmed" mb="md">
                Retrieves medication history from DoseSpot for this patient.
              </Text>
              <Group align="flex-end" justify="flex-start" gap="md">
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
                <Button 
                  onClick={syncHistory} 
                  loading={isSyncingHistory}
                  disabled={isSyncingHistory}
                >
                  Sync History
                </Button>
              </Group>
            </Box>

            <Divider my="lg" />

            <Box>
              <Text size="lg" fw={600} mb="sm">Add Favorite Medication</Text>
              <Text c="dimmed" mb="md">
                Adds a favorite medication to your clinic wide defaults within DoseSpot. Favorites will show up when you add a new prescription.
              </Text>

              <Stack gap="lg">
                <Box>
                  <ValueSetAutocomplete
                    name="medication-selector"
                    label="Select Medication by RxNorm Code"
                    binding="http://www.nlm.nih.gov/research/umls/rxnorm/vs"
                    placeholder="Search for medications..."
                    onChange={(values) => setFormValues(prev => ({ ...prev, medication: values[0] }))}
                    error={formErrors.medication}
                    required
                    maxValues={1}
                  />
                </Box>
                
                <TextInput
                  label="Dosage Directions"
                  placeholder="e.g., Take 1 tablet twice daily with food"
                  value={formValues.dosageDirections}
                  onChange={(e) => setFormValues(prev => ({ ...prev, dosageDirections: e.target.value }))}
                  error={formErrors.dosageDirections}
                  required
                />
                
                <Group justify="flex-end" mt="md">
                  <Button 
                    onClick={addFavoriteMedication}
                    loading={isAddingFavorite}
                    disabled={isAddingFavorite}
                    size="md"
                  >
                    Add Favorite Medication
                  </Button>
                </Group>
              </Stack>
            </Box>
          </Stack>
        </Box>
      </Modal>
    </>
  );
}
