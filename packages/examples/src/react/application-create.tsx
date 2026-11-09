// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Resource } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useRef, useState } from 'react';

const newPatient: Patient = { resourceType: 'Patient' };

export function CreatePatient(props: { onCreated: (patient: Patient) => void }): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  async function save(resource: Resource): Promise<void> {
    if (savingRef.current || resource.resourceType !== 'Patient') {
      return;
    }
    // Block repeated submissions before React renders the disabled fieldset.
    savingRef.current = true;
    setSaving(true);
    setOutcome(undefined);
    try {
      const saved = await medplum.createResource(resource);
      props.onCreated(saved);
    } catch (error) {
      setOutcome(normalizeOperationOutcome(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={saving}>
      <legend>New patient</legend>
      <ResourceForm defaultValue={newPatient} outcome={outcome} onSubmit={save} />
      {saving && <p role="status">Saving patient...</p>}
    </fieldset>
  );
}
// end-block example
