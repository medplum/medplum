import React, { useCallback } from 'react';
import { 
  Box, 
  Group, 
  Text, 
} from '@mantine/core';
import { MedicationKnowledge, Bundle } from '@medplum/fhirtypes';
import { AsyncAutocomplete } from '@medplum/react';

export interface DoseSpotMedicationSelectProps {
  searchMedications: (term: string) => Promise<Bundle<MedicationKnowledge> | undefined>;
  onMedicationSelect: (medication: MedicationKnowledge) => void;
}

export function DoseSpotMedicationSelect({ searchMedications, onMedicationSelect }: DoseSpotMedicationSelectProps): React.JSX.Element {
  const loadOptions = useCallback(async (input: string): Promise<MedicationKnowledge[]> => {
    if (!input.trim() || input.trim().length < 3) {
      return [];
    }
    const results = await (searchMedications as (term: string) => Promise<Bundle<MedicationKnowledge> | undefined>)(input.trim());

    if (!results) {
      return [];
    }
    
    return results.entry?.map(entry => entry.resource as MedicationKnowledge).filter(Boolean) || [];
    
  }, [searchMedications]);

  const toOption = useCallback((medication: MedicationKnowledge) => ({
    value: medication.id || '0',
    label: getMedicationName(medication),
    resource: medication
  }), []);

  const getMedicationName = (medication: MedicationKnowledge): string => {
    return medication.code?.text || 'Unknown Medication';
  };

  const handleMedicationSelect = (medication: MedicationKnowledge): void => {
    onMedicationSelect(medication);
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
      minInputLength={3} //DoseSpot requires at least 3 characters to search
      clearable
      maxValues={1} // Only allow single selection
    />
  );
} 