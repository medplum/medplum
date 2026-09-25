// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Button } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Resource } from '@medplum/fhirtypes';
import { Modal, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
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
  readonly patient: Patient;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function PatientEditModal(props: PatientEditModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const medplum = useMedplum();
  const formId = useId();
  const [value, setValue] = useState<Resource | undefined>();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!opened || !patient.id) {
      return;
    }
    medplum
      .readResource('Patient', patient.id)
      .then((resource) => setValue(deepClone(resource)))
      .catch((err) => {
        setOutcome(normalizeOperationOutcome(err));
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      });
  }, [opened, patient.id, medplum]);

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
        value ? (
          <Button type="submit" form={formId} loading={submitting}>
            Save
          </Button>
        ) : undefined
      }
    >
      {value ? (
        <ResourceFormWithRequiredProfile
          missingProfileMessage={missingProfileMessage}
          defaultValue={value}
          onSubmit={handleSubmit}
          outcome={outcome}
          profileUrl={RESOURCE_PROFILE_URLS.Patient}
          formId={formId}
          hideSubmitButton
        />
      ) : null}
    </Modal>
  );
}
