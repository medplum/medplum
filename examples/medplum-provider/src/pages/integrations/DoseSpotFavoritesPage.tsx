// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Paper,
  Button,
  Modal,
  Group,
  Box,
  TextInput,
  Stack,
  Divider,
  Group as MantineGroup,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM, useDoseSpotClinicFormulary } from '@medplum/dosespot-react';
import { CodeableConcept, MedicationKnowledge } from '@medplum/fhirtypes';
import { IconPlus } from '@tabler/icons-react';
import { formatSearchQuery, isCodeableConcept, normalizeErrorString } from '@medplum/core';
import { AsyncAutocomplete, useMedplum } from '@medplum/react';
import { FavoriteMedicationsTable } from './FavoriteMedicationsTable';
import { showErrorNotification } from '../../utils/notifications';
import { v4 as uuidv4 } from 'uuid';

/**
 * This is a demo component for how you could display your favorite Medications
 * from DoseSpot.
 *
 * @returns A React component that displays the favorite medications and allows you to add new favorites.
 */
export function DoseSpotFavoritesPage(): React.JSX.Element {
  const [modalOpened, setModalOpened] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingFavorites, setLoadingFavorites] = useState(true);
  const [clinicFavoriteMedications, setClinicFavoriteMedications] = useState<MedicationKnowledge[] | undefined>();

  const {
    state,
    saveFavoriteMedication,
    searchMedications,
    setSelectedMedicationDirections,
    setSelectedMedication,
    clear,
  } = useDoseSpotClinicFormulary();
  const medplum = useMedplum();

  // Load favorite MedicationKnowledge resources that have a DoseSpot favorite id system
  useEffect(() => {
    const loadFavorites = async (): Promise<void> => {
      try {
        setLoadingFavorites(true);
        const searchRequest = {
          resourceType: 'MedicationKnowledge' as const,
          filters: [
            {
              code: 'code',
              operator: 'eq' as const,
              value: `${DOSESPOT_CLINIC_FAVORITE_ID_SYSTEM}|`,
            },
          ],
        };
        const queryString = formatSearchQuery(searchRequest);
        const result = await medplum.search('MedicationKnowledge', queryString);
        setClinicFavoriteMedications(result.entry?.map((e) => e.resource as MedicationKnowledge) || []);
      } catch (err) {
        showErrorNotification(err);
      } finally {
        setLoadingFavorites(false);
      }
    };
    loadFavorites().catch(showErrorNotification);
  }, [medplum]);

  const handleAddFavoriteMedication = async (): Promise<void> => {
    try {
      setLoading(true);
      const created = await saveFavoriteMedication();
      // Optimistically update local favorites list
      setClinicFavoriteMedications((prev) => [created, ...(prev || [])]);
      setModalOpened(false);
      showNotification({
        title: 'Medication added to favorites',
        message: 'The medication has been added to your favorites',
        color: 'green',
      });
    } catch (error) {
      showErrorNotification({
        title: 'Error adding medication to favorites',
        message: normalizeErrorString(error as Error),
        color: 'red',
      });
    } finally {
      clear();
      setLoading(false);
    }
  };

  const toOption = (medication: CodeableConcept): { value: string; label: string; resource: CodeableConcept } => ({
    value: uuidv4(),
    label: medication.text || 'Unknown Medication',
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
        <FavoriteMedicationsTable
          clinicFavoriteMedications={clinicFavoriteMedications}
          loadingFavorites={loadingFavorites}
        />
      </Paper>

      <Modal
        opened={modalOpened}
        onClose={() => {
          setModalOpened(false);
          clear();
        }}
        title="Medication"
        size="lg"
        withCloseButton
      >
        <Box>
          <AsyncAutocomplete<CodeableConcept>
            placeholder="Search medications..."
            loadOptions={searchMedications}
            toOption={toOption}
            onChange={(medications) => {
              if (medications.length > 0) {
                setSelectedMedication(medications[0] as CodeableConcept);
              } else {
                setSelectedMedication(undefined);
              }
            }}
            minInputLength={3} //DoseSpot requires at least 3 characters to search
            clearable
            maxValues={1} // Only allow single selection
          />

          {/* After selecting a medication, show the medication info with followup input items */}
          {state.selectedMedication && isCodeableConcept(state.selectedMedication) && (
            <Stack gap="md" mt="lg">
              <Divider />
              {/* Prescription Form */}
              <TextInput
                label="Directions"
                placeholder="e.g., Take 1 tablet by mouth daily"
                value={state.directions}
                onChange={(e) => setSelectedMedicationDirections(e.target.value)}
                required
              />
            </Stack>
          )}

          {/* Action Buttons */}
          <MantineGroup justify="flex-end" gap="md" mt="md">
            <Button
              onClick={() => handleAddFavoriteMedication()}
              disabled={!state.directions || !state.selectedMedication || loading}
              loading={loading}
            >
              Add Favorite
            </Button>
          </MantineGroup>
        </Box>
      </Modal>
    </Container>
  );
}
