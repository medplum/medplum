import React, { useState } from 'react';
import {
  Box,
  Button,
  Group,
  Stack,
  Text,
  TextInput,
  Textarea,
  NumberInput,
  Switch,
  Badge,
  Divider
} from '@mantine/core';
import { MedicationKnowledge } from '@medplum/fhirtypes';
import { NDC, RXNORM } from '@medplum/core';

export interface NewMedicationFormProps {
  readonly medication: MedicationKnowledge;
  readonly addFavoriteMedication: (medication: MedicationKnowledge) => Promise<void>;
  readonly onCancel: () => void;
  readonly loading?: boolean;
}

interface FormData {
  quantity: number;
  refills: number;
  daysSupply: number;
  directions: string;
  notes: string;
  noSubstitutions: boolean;
}

export function NewMedicationForm(props: NewMedicationFormProps): React.JSX.Element {
  const { medication, addFavoriteMedication, onCancel, loading = false } = props;
  const [formData, setFormData] = useState<FormData>({
    quantity: 1,
    refills: 0,
    daysSupply: 30,
    directions: '',
    notes: '',
    noSubstitutions: false
  });

  const handleAddFavorite = async (): Promise<void> => {
    // Create the updated medication with proper FHIR structure
    const updatedMedication: MedicationKnowledge = {
      ...medication,
      // Use amount field for quantity
      amount: {
        value: formData.quantity,
        unit: 'units',
      },

      // Use regulatory for substitution information
      regulatory: [
        {
          regulatoryAuthority: {
            display: 'DoseSpot'
          },
          substitution: [
            {
              allowed: !formData.noSubstitutions,
              type: {
                coding: [
                  {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-substanceAdminSubstitution',
                    code: 'G',
                    display: 'Generic Substitution'
                  }
                ]
              }
            }
          ]
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
                    system: 'http://dosespot.com/dosage-type',
                    code: 'prescription'
                  }
                ]
              }
            }
          ]
        }
      ]
    };

    await addFavoriteMedication(updatedMedication);
  };

  const getMedicationName = (medication: MedicationKnowledge): string => {
    return (medication as any).name || 
           medication.code?.text || 
           'Unknown Medication';
  };

  const getCodingValue = (medication: MedicationKnowledge, system: string): string | undefined => {
    return medication.code?.coding?.find(coding => coding.system === system)?.code;
  };

  const isCompound = (medication: MedicationKnowledge): boolean => {
    const name = getMedicationName(medication);
    return name.toLowerCase().includes('compound') || false;
  };


  const ndcCode = getCodingValue(medication, NDC);
  const rxNormCode = getCodingValue(medication, RXNORM);
  const dosespotId = getCodingValue(medication, 'https://dosespot.com/dispensable-drug-id');
  const compound = isCompound(medication);

  return (
    <Box> 
      {/* Medication Info */}
      <Stack gap="md" mb="xl">
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
          {compound && (
            <Badge color="blue" size="sm">Compound</Badge>
          )}
        </Box>

        <Divider />

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

        <Group grow>
          <NumberInput
            label="Days Supply"
            placeholder="30"
            min={1}
            max={365}
            value={formData.daysSupply}
            onChange={(value) => setFormData(prev => ({ ...prev, daysSupply: Number(value) || 30 }))}
            required
          />
        </Group>

        <TextInput
          label="Directions"
          placeholder="e.g., Take 1 tablet by mouth daily"
          value={formData.directions}
          onChange={(e) => setFormData(prev => ({ ...prev, directions: e.target.value }))}
          required
        />

        <Textarea
          label="Notes"
          placeholder="Enter any additional notes..."
          value={formData.notes}
          onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
          minRows={2}
        />

        <Switch
          label="No Substitutions"
          checked={formData.noSubstitutions}
          onChange={(e) => setFormData(prev => ({ ...prev, noSubstitutions: e.currentTarget.checked }))}
        />
      </Stack>

      {/* Action Buttons */}
      <Group justify="flex-end" gap="md">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleAddFavorite}
          disabled={!formData.directions}
          loading={loading}
        >
          Add Favorite
        </Button>
      </Group>
    </Box>
  );
} 