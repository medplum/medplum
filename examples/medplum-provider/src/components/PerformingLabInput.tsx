// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDisplayString, getReferenceString } from '@medplum/core';
import type { Patient, Resource } from '@medplum/fhirtypes';
import type { LabOrderInputErrors, LabOrganization } from '@medplum/health-gorilla-core';
import { useHealthGorillaLabOrderContext } from '@medplum/health-gorilla-react';
import { AsyncAutocomplete } from '@medplum/react';
import type { AsyncAutocompleteOption } from '@medplum/react';
import { useEffect } from 'react';
import type { JSX } from 'react';

export type PractitionerInputProps = {
  patient: Patient | undefined;
  performingLab?: LabOrganization | undefined;
  error?: NonNullable<LabOrderInputErrors['performingLab']>;
};

export function PerformingLabInput({ patient, performingLab, error }: PractitionerInputProps): JSX.Element {
  const { searchAvailableLabs, setPerformingLab } = useHealthGorillaLabOrderContext();
  useEffect(() => {
    if (performingLab) {
      setPerformingLab(performingLab);
    }
  }, [performingLab, setPerformingLab]);
  return (
    <AsyncAutocomplete<LabOrganization>
      required
      error={error?.message}
      label="Performing lab"
      disabled={!patient}
      maxValues={1}
      defaultValue={performingLab}
      loadOptions={searchAvailableLabs}
      toOption={resourceToOption}
      onChange={(item) => {
        if (item.length > 0) {
          setPerformingLab(item[0]);
        } else {
          setPerformingLab(undefined);
        }
      }}
    />
  );
}

function resourceToOption<T extends Resource>(resource: T): AsyncAutocompleteOption<T> {
  return {
    value: getReferenceString(resource) ?? '',
    label: getDisplayString(resource),
    resource,
  };
}
