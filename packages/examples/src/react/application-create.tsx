// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
import { Fieldset, Text } from '@mantine/core';
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
      // The callback should navigate away or reset this form to avoid resubmitting the same patient.
      props.onCreated(saved);
    } catch (error) {
      setOutcome(normalizeOperationOutcome(error));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Fieldset legend="New patient" disabled={saving}>
      <ResourceForm defaultValue={newPatient} outcome={outcome} onSubmit={save} />
      {saving && <Text role="status">Saving patient...</Text>}
    </Fieldset>
  );
}
// end-block example
