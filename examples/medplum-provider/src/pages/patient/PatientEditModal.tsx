// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useId, useState } from 'react';
import { ResourceFormWithRequiredProfile } from '../../components/ResourceFormWithRequiredProfile';
import { RESOURCE_PROFILE_URLS } from '../resource/utils';

export interface PatientEditModalProps {
  readonly patient: Patient | Reference<Patient>;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function PatientEditModal(props: PatientEditModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const medplum = useMedplum();
  const formId = useId();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title="Edit Patient Profile Details"
      bodyHeight="70vh"
      actions={
        <Button type="submit" form={formId} loading={submitting}>
          Save
        </Button>
      }
    >
      <ResourceFormWithRequiredProfile
        defaultValue={patient}
        profileUrl={RESOURCE_PROFILE_URLS.Patient}
        outcome={outcome}
        onSubmit={handleSubmit}
        formId={formId}
        hideSubmitButton
      />
    </Modal>
  );
}
