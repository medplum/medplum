// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
import { normalizeOperationOutcome } from '@medplum/core';
import type { OperationOutcome, Patient, Resource } from '@medplum/fhirtypes';
import { ResourceForm } from '@medplum/react';
import { useMedplum } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';

const newPatient: Patient = { resourceType: 'Patient' };

export function CreatePatient(props: { onCreated: (patient: Patient) => void }): JSX.Element {
  const medplum = useMedplum();
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const [saving, setSaving] = useState(false);

  async function save(resource: Resource): Promise<void> {
    if (saving || resource.resourceType !== 'Patient') {
      return;
    }
    setSaving(true);
    setOutcome(undefined);
    try {
      const saved = await medplum.createResource(resource);
      props.onCreated(saved);
    } catch (error) {
      setOutcome(normalizeOperationOutcome(error));
    } finally {
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
