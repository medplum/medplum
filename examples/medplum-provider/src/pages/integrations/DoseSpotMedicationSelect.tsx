import React, { useState, useCallback } from 'react';
import { 
  Box, 
  Group, 
  Text, 
  Container,
  Title,
  Paper,
  Modal
} from '@mantine/core';
import { notifications, showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useDoseSpotClinicFormulary } from '@medplum/dosespot-react';
import { MedicationKnowledge, Bundle } from '@medplum/fhirtypes';
import { AsyncAutocomplete } from '@medplum/react';
import { NewMedicationForm } from './NewMedicationForm';

export function DoseSpotMedicationSelect(): React.JSX.Element {
  const [modalMedication, setModalMedication] = useState<MedicationKnowledge | null>(null);
  const [modalOpened, setModalOpened] = useState(false);
  
  const {
    searchMedications,
    addFavoriteMedication,
    addFavoriteMedicationLoading
  } = useDoseSpotClinicFormulary();

  const loadOptions = useCallback(async (input: string, signal: AbortSignal): Promise<MedicationKnowledge[]> => {
    if (!input.trim() || input.trim().length < 3) {
      return [];
    }

    try {
      // Type assertion to work around the TypeScript definition issue
      const results = await (searchMedications as (term: string) => Promise<Bundle<MedicationKnowledge> | undefined>)(input.trim());
      if (signal.aborted) {
        return [];
      }
      
      if (!results) {
        return [];
      }
      
      return results.entry?.map(entry => entry.resource as MedicationKnowledge).filter(Boolean) || [];
    } catch (err) {
      if (!signal.aborted) {
        showNotification({ 
          color: 'red', 
          title: 'Error', 
          message: normalizeErrorString(err) 
        });
      }
      return [];
    }
  }, [searchMedications]);

  const toOption = useCallback((medication: MedicationKnowledge) => ({
    value: medication.id || Math.random().toString(),
    label: getMedicationName(medication),
    resource: medication
  }), []);

  const getMedicationName = (medication: MedicationKnowledge): string => {
    return medication.code?.text || 'Unknown Medication';
  };

  const handleMedicationSelect = (medication: MedicationKnowledge): void => {
    setModalMedication(medication);
    setModalOpened(true);
  };

  const handleModalClose = (): void => {
    setModalOpened(false);
    setModalMedication(null);
  };

  const handleAddFavorite = async (medication: MedicationKnowledge): Promise<void> => {
    const loadingId = showNotification({
      color: 'blue',
      title: 'Adding to Favorites',
      message: `Adding ${getMedicationName(medication)} to favorites...`,
      loading: true,
      autoClose: false
    });

    try {
      await addFavoriteMedication(medication);
      
      // Dismiss loading notification
      notifications.hide(loadingId);
      
      showNotification({
        color: 'green',
        title: 'Success',
        message: `${getMedicationName(medication)} added to favorites successfully`,
        autoClose: 3000
      });

      handleModalClose();
    } catch (err) {
      // Dismiss loading notification
      notifications.hide(loadingId);
      
      showNotification({
        color: 'red',
        title: 'Error',
        message: `Failed to add ${getMedicationName(medication)} to favorites: ${normalizeErrorString(err)}`,
        autoClose: 5000
      });
    }
  };

  const itemComponent = (props: { resource: MedicationKnowledge; label: string; active?: boolean }): React.JSX.Element => {
    return (
      <Group gap="md" align="center">
        <Box style={{ flex: 1 }}>
          <Text fw={500} size="sm">
            {props.label}
          </Text>
        </Box>
      </Group>
    );
  };

  return (
    <Container size="xl" py="xl">
      <Paper mb="lg" p="md" withBorder shadow="sm">
        <AsyncAutocomplete
          placeholder="Search medications..."
          loadOptions={loadOptions}
          toOption={toOption}
          itemComponent={itemComponent}
          onChange={(medications) => {
            if (medications.length > 0) {
              handleMedicationSelect(medications[0]);
            }
          }}
          minInputLength={3}
          clearable
          maxValues={1} // Only allow single selection
        />
      </Paper>

      <Modal
        opened={modalOpened}
        onClose={handleModalClose}
        title={
          <Box>
            <Title order={3} mb={0}>
              {modalMedication ? getMedicationName(modalMedication) : 'Medication Details'}
            </Title>
          </Box>
        }
        size="lg"
        withCloseButton
      >
        {modalMedication && (
          <NewMedicationForm
            medication={modalMedication}
            addFavoriteMedication={handleAddFavorite}
            onCancel={handleModalClose}
            loading={addFavoriteMedicationLoading}
          />
        )}
      </Modal>
    </Container>
  );
}