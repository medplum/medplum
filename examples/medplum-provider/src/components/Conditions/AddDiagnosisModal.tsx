// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Tabs } from '@mantine/core';
import type { WithId } from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { Modal } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import classes from './AddDiagnosisModal.module.css';
import ExistingDiagnosisPanel from './ExistingDiagnosisPanel';
import NewDiagnosisPanel from './NewDiagnosisPanel';

/**
 * Props for AddDiagnosisModal.
 * - opened / onClose: modal visibility.
 * - patient / encounter: the patient and encounter the diagnosis is added to.
 * - excludeCodes: diagnosis codes already on the encounter, left out of the existing list.
 * - onSubmitExisting: called with a Condition the patient already has.
 * - onSubmitNew: called with an unsaved Condition built from the picked ICD-10 code and status.
 */
export interface AddDiagnosisModalProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly patient: WithId<Patient>;
  readonly encounter: Encounter;
  readonly excludeCodes: string[];
  readonly onSubmitExisting: (condition: WithId<Condition>) => void;
  readonly onSubmitNew: (condition: Condition) => void;
}

export default function AddDiagnosisModal(props: AddDiagnosisModalProps): JSX.Element {
  const { opened, onClose, patient, encounter, excludeCodes, onSubmitExisting, onSubmitNew } = props;
  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [existing, setExisting] = useState<WithId<Condition>>();
  const [created, setCreated] = useState<Condition>();
  const pending = tab === 'existing' ? existing : created;
  const panelsRef = useRef<HTMLDivElement>(null);

  // Focus the visible panel's search box when switching tabs. Mantine's data-autofocus covers opening.
  useEffect(() => {
    panelsRef.current?.querySelector<HTMLInputElement>(':scope > :not([inert]) input')?.focus();
  }, [tab]);

  const reset = (): void => {
    setTab('existing');
    setExisting(undefined);
    setCreated(undefined);
  };

  const close = (): void => {
    reset();
    onClose();
  };

  const submit = (): void => {
    reset();
    if (tab === 'existing' && existing) {
      onSubmitExisting(existing);
    } else if (tab === 'new' && created) {
      onSubmitNew(created);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={close}
      title="Add Diagnosis"
      size="lg"
      actions={
        <Button disabled={!pending} onClick={submit}>
          Add Diagnosis
        </Button>
      }
    >
      <Tabs
        variant="unstyled"
        classNames={{ root: classes.tabs, list: classes.tabsList, tab: classes.tab }}
        value={tab}
        onChange={(value) => setTab(value === 'new' ? 'new' : 'existing')}
      >
        <Tabs.List>
          <Tabs.Tab value="existing">Existing Diagnosis</Tabs.Tab>
          <Tabs.Tab value="new">New Diagnosis</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Divider my="lg" />
      <div ref={panelsRef} className={classes.panels}>
        <div className={classes.panel} inert={tab !== 'existing'} aria-hidden={tab !== 'existing'}>
          <ExistingDiagnosisPanel patient={patient} excludeCodes={excludeCodes} onChange={setExisting} />
        </div>
        <div className={classes.panel} inert={tab !== 'new'} aria-hidden={tab !== 'new'}>
          <NewDiagnosisPanel patient={patient} encounter={encounter} onChange={setCreated} />
        </div>
      </div>
    </Modal>
  );
}
