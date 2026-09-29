// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Box, Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { RESOURCE_PROFILE_URLS } from '../resource/utils';

const missingProfileMessage = RESOURCE_PROFILE_URLS.Patient ? (
  <>
    Could not find the{' '}
    <Anchor href={RESOURCE_PROFILE_URLS.Patient} target="_blank">
      US Core Patient Profile
    </Anchor>
  </>
) : undefined;

export interface PatientEditModalProps {
  readonly patient: Patient | Reference<Patient>;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function PatientEditModal(props: PatientEditModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const handleSubmit = useCallback(
    (newResource: Resource): void => {
      setOutcome(undefined);
      setSubmitting(true);
      medplum
        .updateResource(newResource)
        .then(() => {
          showNotification({ color: 'green', message: 'Success' });
          onClose();
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        })
        .finally(() => setSubmitting(false));
    },
    [medplum, onClose]
  );

  const handleSave = useCallback((): void => {
    bodyRef.current?.querySelector('form')?.requestSubmit();
  }, []);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title="Edit Patient Profile Details"
      bodyHeight="70vh"
      actions={
        <Button onClick={handleSave} loading={submitting}>
          Save
        </Button>
      }
    >
      <Box ref={bodyRef}>
        <ResourceFormWithRequiredProfile
          missingProfileMessage={missingProfileMessage}
          defaultValue={patient}
          onSubmit={handleSubmit}
          outcome={outcome}
          profileUrl={RESOURCE_PROFILE_URLS.Patient}
          hideSubmitButton
        />
      </Box>
    </Modal>
  );
}
