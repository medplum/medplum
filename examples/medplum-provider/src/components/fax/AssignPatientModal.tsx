// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Input } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createReference, normalizeErrorString } from '@medplum/core';
import type { Patient, Reference } from '@medplum/fhirtypes';
import { Modal, ResourceInput, useMedplum } from '@medplum/react';
import { IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface AssignPatientModalProps {
  opened: boolean;
  onClose: () => void;
  resourceType: 'Communication' | 'DocumentReference';
  resourceId: string;
  onAssigned: () => void;
  /** When set, this patient is pre-selected when the modal opens (e.g. already assigned to the fax). */
  defaultPatient?: Reference<Patient>;
}

export function AssignPatientModal({
  opened,
  onClose,
  resourceType,
  resourceId,
  onAssigned,
  defaultPatient,
}: AssignPatientModalProps): JSX.Element {
  const medplum = useMedplum();
  const [patient, setPatient] = useState<Reference<Patient> | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (opened) {
      setPatient(defaultPatient);
    }
  }, [opened, defaultPatient]);

  const resourceInputKey = opened ? `${resourceId}-${defaultPatient?.reference ?? 'none'}` : 'closed';

  const handleAssign = async (): Promise<void> => {
    if (!patient) {
      return;
    }

    setIsSubmitting(true);
    try {
      await medplum.patchResource(resourceType, resourceId, [{ op: 'add', path: '/subject', value: patient }]);

      notifications.show({
        color: 'green',
        icon: '✓',
        title: 'Patient assigned successfully',
        message: '',
      });

      onAssigned();
      handleClose();
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemovePatient = async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await medplum.patchResource(resourceType, resourceId, [{ op: 'remove', path: '/subject' }]);

      notifications.show({
        color: 'green',
        icon: '✓',
        title: 'Patient assignment removed successfully',
        message: '',
      });

      onAssigned();
      handleClose();
    } catch (error) {
      notifications.show({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = (): void => {
    setPatient(undefined);
    setIsSubmitting(false);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Assign Patient"
      size="md"
      centered
      actions={
        <>
          <Button variant="filled" onClick={handleAssign} loading={isSubmitting} disabled={!patient}>
            Assign Patient
          </Button>
          {defaultPatient && (
            <Button variant="outline" onClick={handleRemovePatient} loading={isSubmitting}>
              Remove Assigned Patient
            </Button>
          )}
        </>
      }
    >
      <Input.Wrapper label="Select Patient" description="This fax will be added to the Documents in their profile">
        <Box mt="calc(var(--mantine-spacing-xs) / 2)">
          <ResourceInput<Patient>
            key={resourceInputKey}
            resourceType="Patient"
            name="patient"
            placeholder="Type to search patients..."
            defaultValue={defaultPatient}
            onChange={(value: Patient | undefined) => setPatient(value ? createReference(value) : undefined)}
          />
        </Box>
      </Input.Wrapper>
    </Modal>
  );
}
