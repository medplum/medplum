import { Button, Group, Stack, TextInput, Select } from '@mantine/core';
import { Observation, Patient } from '@medplum/fhirtypes';
import { useCallback } from 'react';

export interface SocialHistoryDialogProps {
  readonly patient: Patient;
  readonly observation?: Observation;
  readonly onSubmit: (observation: Observation) => void;
}

export function SocialHistoryDialog(props: SocialHistoryDialogProps): JSX.Element {
  const { patient, observation, onSubmit } = props;

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const formData = new FormData(e.target as HTMLFormElement);
      const code = formData.get('code') as string;
      const value = formData.get('value') as string;
      const status = formData.get('status') as 'final' | 'preliminary' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error';

      const updatedObservation: Observation = {
        ...observation,
        resourceType: 'Observation',
        status: status,
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/observation-category',
                code: 'social-history',
                display: 'Social History'
              }
            ]
          }
        ],
        code: {
          coding: [
            {
              system: 'http://loinc.org',
              code: '76690-7', // Generic social history code
              display: code
            }
          ],
          text: code
        },
        valueCodeableConcept: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '261665006', // Generic social history value code
              display: value
            }
          ],
          text: value
        },
        subject: {
          reference: `Patient/${patient.id}`
        }
      };

      onSubmit(updatedObservation);
    },
    [observation, onSubmit, patient.id]
  );

  return (
    <form onSubmit={handleSubmit}>
      <Stack>
        <Select
          label="Type"
          name="code"
          defaultValue={observation?.code?.text}
          data={[
            { value: 'Sexual Orientation', label: 'Sexual Orientation' },
            { value: 'Smoking Status', label: 'Smoking Status' },
            { value: 'Occupation', label: 'Occupation' },
            { value: 'Occupation Industry', label: 'Occupation Industry' },
            { value: 'Housing Status', label: 'Housing Status' },
            { value: 'Education Level', label: 'Education Level' }
          ]}
          required
        />
        <TextInput
          label="Value"
          name="value"
          defaultValue={observation?.valueCodeableConcept?.text}
          required
        />
        <Select
          label="Status"
          name="status"
          defaultValue={observation?.status || 'final'}
          data={[
            { value: 'final', label: 'Final' },
            { value: 'preliminary', label: 'Preliminary' },
            { value: 'amended', label: 'Amended' },
            { value: 'corrected', label: 'Corrected' },
            { value: 'cancelled', label: 'Cancelled' },
            { value: 'entered-in-error', label: 'Entered in Error' }
          ]}
          required
        />
        <Group justify="flex-end" mt="md">
          <Button type="submit">{observation ? 'Update' : 'Create'}</Button>
        </Group>
      </Stack>
    </form>
  );
} 