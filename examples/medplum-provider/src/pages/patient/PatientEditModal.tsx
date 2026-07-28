// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Modal } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { deepClone, normalizeErrorString, normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Resource } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
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

/**
 * State-driven modal for editing a patient's profile details. Reuses the same form flow as
 * the full-page {@link EditTab} (`/Patient/:id/edit`), but opens in place over whatever page
 * currently shows the Patient Summary — so it works on the patient chart and on top-level
 * pages like /Communication and /Task alike.
 * @param props - The modal props.
 * @returns The patient profile edit modal.
 */
export function PatientEditModal(props: PatientEditModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const medplum = useMedplum();
  const [value, setValue] = useState<Resource | undefined>();
  const [outcome, setOutcome] = useState<OperationOutcome | undefined>();

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
      medplum
        .updateResource(newResource)
        .then(() => {
          showNotification({ color: 'green', message: 'Success' });
          onClose();
        })
        .catch((err) => {
          setOutcome(normalizeOperationOutcome(err));
          showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
        });
    },
    [medplum, onClose]
  );

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title="Edit Patient Profile Details"
      styles={{
        body: {
          padding: 0,
          overflow: 'hidden',
          height: '70vh',
          flex: 'none',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {value ? (
        <ResourceFormWithRequiredProfile
          missingProfileMessage={missingProfileMessage}
          defaultValue={value}
          onSubmit={handleSubmit}
          outcome={outcome}
          profileUrl={RESOURCE_PROFILE_URLS.Patient}
          stackedSubmit
          stickyModalFooter
        />
      ) : null}
    </Modal>
  );
}
