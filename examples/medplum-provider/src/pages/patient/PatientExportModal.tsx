// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Reference } from '@medplum/fhirtypes';
import { Modal, PatientExportForm } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export interface PatientExportModalProps {
  readonly patient: Patient | Reference<Patient>;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function PatientExportModal(props: PatientExportModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const [resetKey, setResetKey] = useState(0);

  return (
    <PatientExportForm key={resetKey} patient={patient}>
      {({ body, actions, onSubmit }) => (
        <Modal
          opened={opened}
          onClose={onClose}
          onExitTransitionEnd={() => setResetKey((key) => key + 1)}
          size="lg"
          title="Export Patient Records"
          onSubmit={onSubmit}
          actions={actions}
        >
          {body}
        </Modal>
      )}
    </PatientExportForm>
  );
}
