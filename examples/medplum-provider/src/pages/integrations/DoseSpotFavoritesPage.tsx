import React, { useState } from 'react';
import { 
  Container, 
  Title, 
  Paper, 
  Button, 
  Modal, 
  Group,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { 
  DoseSpotNewMedicationForm,
  useDoseSpotClinicFormulary,
} from '@medplum/dosespot-react';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { IconPlus } from '@tabler/icons-react';
import { normalizeErrorString  } from '@medplum/core';
import { SearchControl } from '@medplum/react';        

export function DoseSpotFavoritesPage(): React.JSX.Element {
  const [modalOpened, setModalOpened] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { addFavoriteMedication, addFavoriteMedicationLoading, searchMedications } = useDoseSpotClinicFormulary();


  const handleAddFavoriteMedication = async (medication: MedicationKnowledge): Promise<void> => {
    try {
      await addFavoriteMedication(medication);
      setModalOpened(false);
      showNotification({
        title: 'Medication added to favorites',
        message: 'The medication has been added to your favorites',
        color: 'green',
      });
      // Wait a second then refresh the search
      setTimeout(() => {
        setRefreshKey(prev => prev + 1);
      }, 1000);
    } catch (error) {
      showNotification({
        title: 'Error adding medication to favorites',
        message: normalizeErrorString(error as Error),
        color: 'red',
      });
    }
  };



  return (
    <Container size="xl" py="xl">
      <Paper mb="lg" p="md" withBorder shadow="sm">
        <Group justify="space-between" mb="md">
          <Title order={2}>
            DoseSpot Medication Favorites
          </Title>
          <Button 
            leftSection={<IconPlus size={16} />}
            onClick={() => setModalOpened(true)}
          >
            Add Favorite Medication
          </Button>
        </Group>

        <SearchControl 
          key={refreshKey}
          search={{
            resourceType: 'MedicationKnowledge',
            filters: [
                { 
                  code: 'code',              
                  operator: 'eq',
                  value: 'https://dosespot.com/clinic-favorite-medication-id|'
                }
            ],
            fields: [ 'code', 'amount']
          }}
          hideFilters = {true}
          hideToolbar = {true}
        /> 
      </Paper>

      <Modal
        opened={modalOpened}
        onClose={() => setModalOpened(false)}
        title="Add Medication to Favorites"
        size="lg"
        withCloseButton
      >
        <DoseSpotNewMedicationForm
          searchMedications={searchMedications}
          addFavoriteMedication={handleAddFavoriteMedication}
          loading={addFavoriteMedicationLoading}
        />
      </Modal>
    </Container>
  );
}
