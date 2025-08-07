import React, { useState } from 'react';
import { Container, Title, Paper, Button, Modal, Group, Box, TextInput, Stack, Divider, Text, Group as MantineGroup } from '@mantine/core';
import { showNotification } from '@mantine/notifications';  
import { useDoseSpotClinicFormulary } from '@medplum/dosespot-react';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { IconPlus } from '@tabler/icons-react';
import { normalizeErrorString } from '@medplum/core';
import { AsyncAutocomplete } from '@medplum/react';
import { FavoriteMedicationsTable } from './FavoriteMedicationsTable';


/**
 * This is a demo component for how you could display your favorite Medications
 * from DoseSpot.
 * 
 * The page is refreshed when a medication is added to the favorites list.
 * 
 * @returns A React component that displays the favorite medications.
 */
export function DoseSpotFavoritesPage(): React.JSX.Element {
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const { state, addFavoriteMedication, searchMedications, setDirections, setSelectedMedication, getMedicationStrength, getMedicationName } = useDoseSpotClinicFormulary();

  const handleAddFavoriteMedication = async (medication: MedicationKnowledge | undefined): Promise<void> => {
    if (!medication) {
      return;
    }

    try {
      setLoading(true);
      await addFavoriteMedication(medication);
      setModalOpened(false);
      setRefreshKey(prev => prev + 1); // Trigger refresh
      showNotification({
        title: 'Medication added to favorites',
        message: 'The medication has been added to your favorites',
        color: 'green',
      });
    } catch (error) {
      showNotification({
        title: 'Error adding medication to favorites',
        message: normalizeErrorString(error as Error),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  const toOption = (medication: MedicationKnowledge): { value: string; label: string; resource: MedicationKnowledge } => ({
    value: Math.random().toString(), //No ids on the MedicationKnowledge objects yet
    label: medication.code?.text || 'Unknown Medication',
    resource: medication,
  });

  return (
    <Container size="xl" py="xl">
      <Paper mb="lg" p="md" withBorder shadow="sm">
        <Group justify="space-between" mb="md">
          <Title order={2}>DoseSpot Medication Favorites</Title>
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpened(true)}>
            Add Favorite Medication
          </Button>
        </Group>

        {/* Example of a table to display favorite medications (MedicationKnowledge resources) */}
        <FavoriteMedicationsTable refreshKey={refreshKey}/>

      </Paper>

      <Modal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          setSelectedMedication(undefined);
          setDirections(undefined);
        }}
        title="Add Medication to Favorites"
        size="lg"
        withCloseButton
      >
        <Box>
          <AsyncAutocomplete<MedicationKnowledge>
            placeholder="Search medications..."
            loadOptions={searchMedications}
            toOption={toOption}
            itemComponent={({ resource }) => (
              <Group gap="sm">
                <div> {/* Show medication name and strength on dropdown */}
                  <Text size="sm">{getMedicationName(resource)}</Text>
                  <Text size="xs" c="dimmed">
                    {getMedicationStrength(resource)}
                  </Text>
                </div>
              </Group>
            )}
            onChange={(medications) => {
              if (medications.length > 0) {
                setSelectedMedication(medications[0]);
              } else {
                setSelectedMedication(undefined);
              }
            }}
            minInputLength={3} //DoseSpot requires at least 3 characters to search
            clearable
            maxValues={1} // Only allow single selection
          />
      
          {/* After selecting a medication, show the medication info with followup input items */}
          {state.selectedMedication && (
            <Stack gap="md" mt="lg">
              <Divider />
              <Box>
                {state.selectedMedication.code?.text && (
                  <Text size="sm" c="dimmed">
                    Medication: {state.selectedMedication?.code?.text}
                  </Text>
                )}
              </Box>

              {/* Prescription Form */}
              <TextInput
                label="Directions"
                placeholder="e.g., Take 1 tablet by mouth daily"
                value={state.directions}
                onChange={(e) => setDirections(e.target.value)}
                required
              />
            </Stack>
          )}

          {/* Action Buttons */}
          <MantineGroup justify="flex-end" gap="md" mt="md">
              <Button onClick={() => handleAddFavoriteMedication(state.selectedMedication)} disabled={!state.directions || !state.selectedMedication || loading } loading={loading}>
              Add Favorite
            </Button> 
          </MantineGroup>
        </Box>
      </Modal>

    </Container>
  );
}
