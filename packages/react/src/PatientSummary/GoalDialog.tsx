// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Stack, TextInput } from '@mantine/core';
import { createReference } from '@medplum/core';
import type { Goal, Patient } from '@medplum/fhirtypes';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { CodeInput } from '../CodeInput/CodeInput';
import { SubmitButton } from '../Form/SubmitButton';
import { MedplumModal } from '../MedplumModal/MedplumModal';

export interface GoalDialogProps {
  readonly patient: Patient;
  readonly goal?: Goal;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (goal: Goal) => void;
  /** When editing an existing goal, called to delete it. */
  readonly onDelete?: () => void;
}

const GOAL_STATUS_VALUESET = 'http://hl7.org/fhir/ValueSet/goal-status';

export function GoalDialog(props: GoalDialogProps): JSX.Element {
  const { patient, goal, opened, onClose, onSubmit, onDelete } = props;
  const [lifecycleStatus, setLifecycleStatus] = useState<Goal['lifecycleStatus']>(goal?.lifecycleStatus ?? 'active');

  const handleSubmit = useCallback(
    (formData: Record<string, string>) => {
      onSubmit({
        ...goal,
        resourceType: 'Goal',
        lifecycleStatus: lifecycleStatus ?? 'active',
        description: { text: formData.description ?? goal?.description?.text ?? '' },
        subject: createReference(patient),
        startDate: formData.startDate || undefined,
        target: formData.dueDate ? [{ ...goal?.target?.[0], dueDate: formData.dueDate }] : goal?.target,
      });
    },
    [patient, goal, lifecycleStatus, onSubmit]
  );

  return (
    <MedplumModal
      opened={opened}
      onClose={onClose}
      title={goal ? 'Edit Goal' : 'Add Goal'}
      size="md"
      onSubmit={handleSubmit}
      actions={
        <>
          <SubmitButton>Save</SubmitButton>
          {goal?.id && onDelete && (
            <Button variant="light" color="red" leftSection={<IconTrash size={16} />} onClick={onDelete}>
              Delete
            </Button>
          )}
        </>
      }
    >
      <Stack gap="md">
        <TextInput
          name="description"
          label="Goal"
          data-autofocus={true}
          required
          defaultValue={goal?.description?.text}
        />
        <CodeInput
          name="lifecycleStatus"
          label="Status"
          binding={GOAL_STATUS_VALUESET}
          maxValues={1}
          defaultValue={goal?.lifecycleStatus ?? 'active'}
          onChange={(value) => setLifecycleStatus((value as Goal['lifecycleStatus']) ?? undefined)}
        />
        <TextInput type="date" name="startDate" label="Start Date" defaultValue={goal?.startDate} />
        <TextInput type="date" name="dueDate" label="Target Date" defaultValue={goal?.target?.[0]?.dueDate} />
      </Stack>
    </MedplumModal>
  );
}
