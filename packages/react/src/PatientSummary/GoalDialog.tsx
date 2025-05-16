import { Button, Group, Select, Stack, TextInput, Textarea } from '@mantine/core';
import { Goal, Patient } from '@medplum/fhirtypes';
import { useCallback } from 'react';
import { Form } from '../Form/Form';
import { SubmitButton } from '../Form/SubmitButton';

export interface GoalDialogProps {
  readonly patient: Patient;
  readonly goal?: Goal;
  readonly onSubmit: (goal: Goal) => void;
  readonly onClose: () => void;
}

const LIFECYCLE_STATUS_OPTIONS = [
  { value: 'proposed', label: 'Proposed' },
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'on-hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'entered-in-error', label: 'Entered in Error' },
];

export function GoalDialog(props: GoalDialogProps): JSX.Element {
  const { patient, goal, onSubmit, onClose } = props;

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      const updatedGoal: Goal = {
        resourceType: 'Goal',
        subject: { reference: `Patient/${patient.id}` },
        description: {
          text: formData.description,
        },
        lifecycleStatus: formData.lifecycleStatus as Goal['lifecycleStatus'],
        startDate: formData.startDate || undefined,
        target: formData.target
          ? [
              {
                measure: {
                  coding: [
                    {
                      system: 'http://loinc.org',
                      code: 'unknown',
                      display: formData.target,
                    },
                  ],
                },
              },
            ]
          : undefined,
      };

      if (goal?.id) {
        updatedGoal.id = goal.id;
      }

      onSubmit(updatedGoal);
    },
    [patient.id, goal?.id, onSubmit]
  );

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <Textarea
          name="description"
          label="Description"
          defaultValue={goal?.description?.text}
          required
          data-autofocus
        />
        <Select
          name="lifecycleStatus"
          label="Status"
          data={LIFECYCLE_STATUS_OPTIONS}
          defaultValue={goal?.lifecycleStatus}
          required
        />
        <TextInput name="startDate" label="Start Date" type="date" defaultValue={goal?.startDate} />
        <TextInput name="target" label="Target" defaultValue={goal?.target?.[0]?.measure?.coding?.[0]?.display} />
        <Group justify="flex-end" gap={4}>
          <Button variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
