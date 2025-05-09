import { getDisplayString, getReferenceString } from '@medplum/core';
import { Patient, Resource } from '@medplum/fhirtypes';
import { LabOrderInputErrors, LabOrganization } from '@medplum/health-gorilla-core';
import { useHealthGorillaLabOrderContext } from '@medplum/health-gorilla-react';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '@medplum/react';
import { JSX } from 'react';

export type PractitionerInputProps = {
  patient: Patient | undefined;
  error?: NonNullable<LabOrderInputErrors['performingLab']>;
};

export function PerformingLabInput({ patient, error }: PractitionerInputProps): JSX.Element {
  const { searchAvailableLabs, setPerformingLab } = useHealthGorillaLabOrderContext();
  return (
    <AsyncAutocomplete<LabOrganization>
      required
      error={error?.message}
      label="Performing lab"
      disabled={!patient}
      maxValues={1}
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
