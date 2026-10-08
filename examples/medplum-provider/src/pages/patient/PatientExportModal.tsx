// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Reference } from '@medplum/fhirtypes';
import { Modal, PatientExportForm } from '@medplum/react';
import type { JSX } from 'react';
import { useRef, useState } from 'react';

export interface PatientExportModalProps {
  readonly patient: Patient | Reference<Patient>;
  readonly opened: boolean;
  readonly onClose: () => void;
}

export function PatientExportModal(props: PatientExportModalProps): JSX.Element {
  const { patient, opened, onClose } = props;
  const [bodyHeight, setBodyHeight] = useState<string>();
  const [resetKey, setResetKey] = useState(0);
  const measurement = useRef<{ node?: HTMLDivElement; tallest: number; done: boolean }>({ tallest: 0, done: false });

  return (
    <PatientExportForm key={resetKey} patient={patient} defaultFormat={bodyHeight ? undefined : 'ccda'}>
      {({ body, actions, onSubmit, format, setFormat }) => (
        <Modal
          opened={opened}
          onClose={onClose}
          onExitTransitionEnd={() => {
            measurement.current = { tallest: 0, done: false };
            setResetKey((key) => key + 1);
          }}
          size="lg"
          title="Export Patient Records"
          bodyHeight={bodyHeight}
          onSubmit={onSubmit}
          actions={actions}
        >
          <div
            key={measurement.current.done ? undefined : format}
            ref={(node) => {
              const m = measurement.current;
              if (!node || node === m.node || m.done) {
                return;
              }
              m.node = node;
              m.tallest = Math.max(m.tallest, node.closest<HTMLElement>('.mantine-Modal-body')?.offsetHeight ?? 0);
              if (format === 'ccda') {
                setFormat('everything');
                return;
              }
              m.done = true;
              if (m.tallest > 0) {
                setBodyHeight(`${m.tallest}px`);
              }
            }}
          >
            {body}
          </div>
        </Modal>
      )}
    </PatientExportForm>
  );
}
