import { formatHumanName } from '@medplum/core';
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
  readonly onChange: (value: HeaderSearchTypes) => void;
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
        return getResourcesFromResponse(
          (await medplum.graphql(buildGraphQLQuery(input))) as SearchGraphQLResponse,
          input
        );
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
        return (item as ServiceRequest).subject?.display;
      }}
      name={props.name}
      className={props.className}
      placeholder={props.placeholder}
      onChange={(items: HeaderSearchTypes[]) => props.onChange(items[0])}
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

function getResourcesFromResponse(response: SearchGraphQLResponse, query: string): HeaderSearchTypes[] {
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
  return sortByRelevance(dedupeResources(resources), query).slice(0, 5);
}

function dedupeResources(resources: HeaderSearchTypes[]): HeaderSearchTypes[] {
  const ids = new Set<string>();
  const result = [];

  for (const resource of resources) {
    if (!ids.has(resource.id as string)) {
      ids.add(resource.id as string);
      result.push(resource);
    }
  }

  return result;
}

function sortByRelevance(resources: HeaderSearchTypes[], query: string): HeaderSearchTypes[] {
  return resources.sort((a: HeaderSearchTypes, b: HeaderSearchTypes) => {
    return getResourceScore(a, query) - getResourceScore(b, query);
  });
}

function getResourceScore(resource: HeaderSearchTypes, query: string): number {
  let bestScore = 0;

  if (resource.identifier) {
    for (const identifier of resource.identifier) {
      bestScore = Math.max(bestScore, getStringScore(identifier.value, query));
    }
  }

  if (resource.resourceType === 'Patient' && resource.name) {
    for (const name of resource.name) {
      bestScore = Math.max(bestScore, getStringScore(formatHumanName(name), query));
    }
  }

  return bestScore;
}

function getStringScore(str: string | undefined, query: string): number {
  if (!str) {
    return 0;
  }
  const index = str.toLowerCase().indexOf(query.toLowerCase());
  if (index < 0) {
    return 0;
  }
  return 100 - index;
}
