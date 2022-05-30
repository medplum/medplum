import { formatHumanName, isUUID } from '@medplum/core';
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
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
    readonly ServiceRequestList: ServiceRequest[] | undefined;
  };
}

export function HeaderSearchInput(props: HeaderSearchInputProps): JSX.Element {
  const medplum = useMedplum();
  return (
    <Autocomplete
      loadOptions={async (input: string, signal: AbortSignal): Promise<HeaderSearchTypes[]> => {
        return getResourcesFromResponse(
          (await medplum.graphql(buildGraphQLQuery(input), { signal })) as SearchGraphQLResponse,
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
  const escaped = JSON.stringify(input);
  if (isUUID(input)) {
    return `{
      Patients1: PatientList(_id: ${escaped}, _count: 1) {
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
      ServiceRequestList(_id: ${escaped}, _count: 1) {
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
  return `{
    Patients1: PatientList(name: ${escaped}, _count: 5) {
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
    Patients2: PatientList(identifier: ${escaped}, _count: 5) {
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
    ServiceRequestList(identifier: ${escaped}, _count: 5) {
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

/**
 * Returns a de-duped and sorted list of resources from the search response.
 * The search request is actually 3+ separate searches, which can include duplicates.
 * This function combines the results, de-dupes, and sorts by relevance.
 * @param response The response from a search query.
 * @param query The user entered search query.
 * @returns The resources to display in the autocomplete.
 */
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

/**
 * Removes duplicate resources from an array by ID.
 * @param resources The array of resources with possible duplicates.
 * @returns The array of resources with no duplicates.
 */
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

/**
 * Sorts an array of resources by relevance.
 * @param resources The candidate resources.
 * @param query The user entered search string.
 * @returns The sorted array of resources.
 */
function sortByRelevance(resources: HeaderSearchTypes[], query: string): HeaderSearchTypes[] {
  return resources.sort((a: HeaderSearchTypes, b: HeaderSearchTypes) => {
    return getResourceScore(b, query) - getResourceScore(a, query);
  });
}

/**
 * Calculates a relevance score of a candidate resource.
 * Higher scores are better.
 * @param resource The candidate resource.
 * @param query The user entered search string.
 * @returns The relevance score of the candidate resource.
 */
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

/**
 * Calculates a relevance score of a candidate display string.
 * Higher scores are better.
 * @param str The candidate display string.
 * @param query The user entered search string.
 * @returns The relevance score of the candidate string.
 */
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
