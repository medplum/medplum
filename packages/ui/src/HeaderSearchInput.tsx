import { Patient, ServiceRequest } from '@medplum/fhirtypes';
import React from 'react';
import { Autocomplete } from './Autocomplete';
import { Avatar } from './Avatar';
import { useMedplum } from './MedplumProvider';
import { ResourceName } from './ResourceName';

export type HeaderSearchTypes = Patient | ServiceRequest;

export interface HeaderSearchInputProps {
  readonly name: string;
  readonly className?: string;
  readonly placeholder?: string;
  readonly onChange: (value: HeaderSearchTypes | undefined) => void;
}

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[];
    readonly Patients2: Patient[];
    readonly ServiceRequestList: ServiceRequest[];
  };
}

export function HeaderSearchInput(props: HeaderSearchInputProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <Autocomplete
      loadOptions={async (input: string): Promise<HeaderSearchTypes[]> => {
        const response = (await medplum.graphql(buildGraphQLQuery(input))) as SearchGraphQLResponse;
        const resources = [];
        if (response.data.Patients1) {
          resources.push(...response.data.Patients1);
        }
        if (response.data.Patients2) {
          resources.push(...response.data.Patients2);
        }
        if (response.data.ServiceRequestList) {
          resources.push(...response.data.ServiceRequestList);
        }
        return resources;
      }}
      getId={(item: HeaderSearchTypes) => {
        return item.id as string;
      }}
      getIcon={(item: HeaderSearchTypes) => <Avatar value={item} />}
      getDisplay={(item: HeaderSearchTypes) => <ResourceName value={item} />}
      getHelpText={(item: HeaderSearchTypes) => {
        if (item.resourceType === 'Patient' && item.birthDate) {
          return 'DoB: ' + item.birthDate;
        }
        return undefined;
      }}
      name={props.name}
      className={props.className}
      placeholder={props.placeholder}
      onChange={(items: HeaderSearchTypes[]) => {
        props.onChange(items.length > 0 ? items[0] : undefined);
      }}
    />
  );
}

function buildGraphQLQuery(input: string): string {
  return `{
    Patients1: PatientList(name: "${encodeURIComponent(input)}") {
      resourceType
      id
      identifier {
        system
        value
      }
      name {
        given
        family
      }
      birthDate
    }
    Patients2: PatientList(identifier: "${encodeURIComponent(input)}") {
      resourceType
      id
      identifier {
        system
        value
      }
      name {
        given
        family
      }
      birthDate
    }
    ServiceRequestList(identifier: "${encodeURIComponent(input)}") {
      resourceType
      id
      identifier {
        system
        value
      }
      subject {
        display
      }
    }
  }`.replace(/\s+/g, ' ');
}
