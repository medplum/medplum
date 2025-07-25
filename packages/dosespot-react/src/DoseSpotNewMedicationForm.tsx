import React, { useState } from 'react';
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  NumberInput,
  Divider
} from '@mantine/core';
import { Bundle, MedicationKnowledge } from '@medplum/fhirtypes';
import {DoseSpotMedicationSelect} from './DoseSpotMedicationSelect';  
import { NDC, RXNORM } from '@medplum/core';
import { DOSESPOT_DISPENSABLE_DRUG_ID_SYSTEM, DOSESPOT_REFILLS_SYSTEM } from './common';

export interface DoseSpotNewMedicationFormProps {
  readonly searchMedications: (term: string) => Promise<Bundle<MedicationKnowledge> | undefined>;
  readonly addFavoriteMedication: (medication: MedicationKnowledge) => Promise<MedicationKnowledge>;
  readonly loading?: boolean;
}

interface FormData {
  quantity: number;
  refills: number;
  directions: string;
}

export function DoseSpotNewMedicationForm(props: DoseSpotNewMedicationFormProps): React.JSX.Element {
  const { searchMedications, addFavoriteMedication, loading = false } = props;
  const [formData, setFormData] = useState<FormData>({
    quantity: 1,
    refills: 0,
    directions: '',
  });
  const [medication, setMedication] = useState<MedicationKnowledge | null>(null);

  
  const handleAddFavorite = async (): Promise<void> => {
    // Create the updated medication with proper FHIR structure
    const completedMedication: MedicationKnowledge = {
      ...medication,
      resourceType: "MedicationKnowledge",
      // Use amount field for quantity
      amount: {
        value: formData.quantity,
        unit: 'units',
      },
      extension: [
        {
          url: DOSESPOT_REFILLS_SYSTEM,
          valueString: formData.refills.toString()
        }
      ],
      // Add administration guidelines for directions
      administrationGuidelines: [
        {
          dosage: [
            {
              dosage: [
                {
                  patientInstruction: formData.directions,
                }
              ],
              type: {
                coding: [
                  {
                    system: 'https://dosespot.com/patient-instructions',
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    await addFavoriteMedication(completedMedication);
    setMedication(completedMedication);
  };

  const getCodingValue = (medication: MedicationKnowledge, system: string): string | undefined => {
    return medication.code?.coding?.find(coding => coding.system === system)?.code;
  };

  const ndcCode = medication ? getCodingValue(medication, NDC) : undefined;
  const rxNormCode = medication ? getCodingValue(medication, RXNORM) : undefined;
  const dosespotId = medication ? getCodingValue(medication, DOSESPOT_DISPENSABLE_DRUG_ID_SYSTEM) : undefined;

  return (
    <Box 
      onKeyDown={async (e) => {
        if (e.key === 'Enter' && formData.directions && medication && !loading) {
          e.preventDefault();
          await handleAddFavorite();
        }
      }}
    > 
      <DoseSpotMedicationSelect searchMedications={searchMedications} onMedicationSelect={setMedication} />
      {/* Medication Info */}

      {medication && (         
        <Stack gap="md" mt="lg">
          <Divider />
          <Box>
            {dosespotId && (
              <Text size="sm" c="dimmed">
                DoseSpot ID: {dosespotId}
              </Text>
            )}
            <Group gap="md" mb="xs">
              {ndcCode && (
                <Text size="sm" c="dimmed">
                  NDC: {ndcCode}
                </Text>
              )}
              {rxNormCode && (
                <Text size="sm" c="dimmed">
                  RxNorm: {rxNormCode}
                </Text>
              )}
            </Group>
          </Box>  

          {/* Prescription Form */}        
          <Group grow>
            <NumberInput
              label="Quantity"
              placeholder="1"
              min={1}
              max={999}
              value={formData.quantity}
              onChange={(value) => setFormData(prev => ({ ...prev, quantity: Number(value) || 1 }))}
              required
            />
            <NumberInput
              label="Refills"
              placeholder="0"
              min={0}
              max={12}
              value={formData.refills}
              onChange={(value) => setFormData(prev => ({ ...prev, refills: Number(value) || 0 }))}
            />
          </Group>

          <TextInput
            label="Directions"
            placeholder="e.g., Take 1 tablet by mouth daily"
            value={formData.directions}
            onChange={(e) => setFormData(prev => ({ ...prev, directions: e.target.value }))}
            required
          />
        </Stack>
      )}

      {/* Action Buttons */}
      <Group justify="flex-end" gap="md" mt="md">
        <Button 
          onClick={handleAddFavorite}
          disabled={!formData.directions || !medication || loading}
          loading={loading}
          
        >
          Add Favorite
        </Button>
      </Group>
    </Box>
  );
} 