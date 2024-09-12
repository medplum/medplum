import { LabOrganization, useHealthGorillaLabOrderContext } from '@medplum-ee/hg-client';
import { getDisplayString, getReferenceString } from '@medplum/core';
import { Patient, Resource } from '@medplum/fhirtypes';
import { AsyncAutocomplete, AsyncAutocompleteOption } from '@medplum/react';

export type PractitionerInputProps = {
  patient: Patient | undefined;
};

export function PerformingLabInput({ patient }: PractitionerInputProps): JSX.Element {
  const { searchAvailableLabs, setPerformingLab } = useHealthGorillaLabOrderContext();
  return (
    <AsyncAutocomplete<LabOrganization>
      required
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
    value: getReferenceString(resource),
    label: getDisplayString(resource),
    resource,
  };
}
