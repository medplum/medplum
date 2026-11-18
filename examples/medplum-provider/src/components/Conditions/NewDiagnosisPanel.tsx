// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select, Stack } from '@mantine/core';
import {
  addProfileToResource,
  capitalize,
  createReference,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
} from '@medplum/core';
import type { Condition, Encounter, Patient } from '@medplum/fhirtypes';
import { CodeableConceptInput } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

/**
 * Props for NewDiagnosisPanel.
 * - patient / encounter: the subject and encounter of the new Condition.
 * - onChange: called with the Condition to create, or undefined until an ICD-10 code is picked.
 */
export interface NewDiagnosisPanelProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onChange: (condition: Condition | undefined) => void;
}

const CLINICAL_STATUS_SYSTEM = HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-clinical';

const CLINICAL_STATUSES = ['active', 'recurrence', 'relapse', 'inactive', 'remission', 'resolved'].map((code) => ({
  value: code,
  label: capitalize(code),
}));

export default function NewDiagnosisPanel(props: NewDiagnosisPanelProps): JSX.Element {
  const { patient, encounter, onChange } = props;
  const [diagnosis, setDiagnosis] = useState<Condition['code']>();
  const [status, setStatus] = useState('active');

  useEffect(() => {
    if (!diagnosis?.coding?.length) {
      onChange(undefined);
      return;
    }
    onChange(
      addProfileToResource(
        {
          resourceType: 'Condition',
          category: [
            {
              coding: [
                {
                  system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-category',
                  code: 'problem-list-item',
                  display: 'Problem List Item',
                },
              ],
              text: 'Problem List Item',
            },
          ],
          subject: createReference(patient),
          encounter: encounter && createReference(encounter),
          code: { coding: [...diagnosis.coding] },
          clinicalStatus: { coding: [{ system: CLINICAL_STATUS_SYSTEM, code: status, display: capitalize(status) }] },
        },
        HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
      )
    );
  }, [patient, encounter, diagnosis, status, onChange]);

  return (
    <Stack gap="md">
      <CodeableConceptInput
        binding="http://hl7.org/fhir/sid/icd-10-cm/vs/billable"
        label="ICD-10 Code"
        placeholder="Search by code or name"
        name="diagnosis"
        path="Condition.code"
        required
        maxValues={1}
        onChange={setDiagnosis}
      />

      <Select
        label="Status"
        name="clinicalStatus"
        required
        allowDeselect={false}
        data={CLINICAL_STATUSES}
        value={status}
        onChange={(code) => setStatus(code ?? 'active')}
      />
    </Stack>
  );
}
