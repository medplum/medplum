// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SpotlightActionData, SpotlightActionGroupData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID } from '@medplum/core';
import type { Patient, ServiceRequest } from '@medplum/fhirtypes';
import type { MedplumNavigateFunction } from '@medplum/react-hooks';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';

export type HeaderSearchTypes = Patient | ServiceRequest;

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
    readonly ServiceRequestList: ServiceRequest[] | undefined;
  };
}

export function Spotlight(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const [nothingFoundMessage, setNothingFoundMessage] = useState('Type to search...');
  const [actions, setActions] = useState<SpotlightActionGroupData[]>([]);

  const handleQueryChange = (query: string): void => {
    if (!query) {
      setNothingFoundMessage('Type to search...');
      setActions([]);
      return;
    }

    setNothingFoundMessage('Searching...');

    const graphqlQuery = buildGraphQLQuery(query);

    medplum
      .graphql(graphqlQuery)
      .then((response: SearchGraphQLResponse) => {
        const resources = getResourcesFromResponse(response);
        const newActions = resourcesToActions(resources, navigate);
        setActions(newActions);
      })
      .catch((error) => {
        console.error('GraphQL query failed:', error);
      })
      .finally(() => {
        setNothingFoundMessage('No results found');
      });
  };

  return (
    <MantineSpotlight
      actions={actions}
      nothingFound={nothingFoundMessage}
      highlightQuery
      searchProps={{
        leftSection: <IconSearch size={20} stroke={1.5} />,
        placeholder: 'Search...',
      }}
      onQueryChange={handleQueryChange}
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
    }`.replaceAll(/\s+/g, ' ');
  }
  // return `{
  //   Patients1: PatientList(name: ${escaped}, _count: 5) {
  //     resourceType
  //     id
  //     identifier {
  //       system
  //       value
  //     }
  //     name {
  //       given
  //       family
  //     }
  //     birthDate
  //   }
  //   Patients2: PatientList(identifier: ${escaped}, _count: 5) {
  //     resourceType
  //     id
  //     identifier {
  //       system
  //       value
  //     }
  //     name {
  //       given
  //       family
  //     }
  //     birthDate
  //   }
  //   ServiceRequestList(identifier: ${escaped}, _count: 5) {
  //     resourceType
  //     id
  //     identifier {
  //       system
  //       value
  //     }
  //     subject {
  //       display
  //     }
  //   }
  // }`.replaceAll(/\s+/g, ' ');
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
  }`.replaceAll(/\s+/g, ' ');
}

/**
 * Returns a de-duped and sorted list of resources from the search response.
 * The search request is actually 3+ separate searches, which can include duplicates.
 * This function combines the results, de-dupes, and sorts by relevance.
 * @param response - The response from a search query.
 * @returns The resources to display in the autocomplete.
 */
function getResourcesFromResponse(response: SearchGraphQLResponse): HeaderSearchTypes[] {
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
  return dedupeResources(resources);
}

/**
 * Removes duplicate resources from an array by ID.
 * @param resources - The array of resources with possible duplicates.
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

function resourcesToActions(
  resources: HeaderSearchTypes[],
  navigate: MedplumNavigateFunction
): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = [];
  const serviceRequestActions: SpotlightActionData[] = [];

  for (const resource of resources) {
    if (resource.resourceType === 'Patient') {
      patientActions.push({
        id: resource.id as string,
        label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
        description: resource.birthDate,
        onClick: () => navigate(`/Patient/${resource.id}`),
      });
    } else if (resource.resourceType === 'ServiceRequest') {
      serviceRequestActions.push({
        id: resource.id as string,
        label: resource.id,
        description: resource.subject?.display,
        onClick: () => navigate(`/ServiceRequest/${resource.id}`),
      });
    }
  }

  const result = [];
  if (patientActions.length > 0) {
    result.push({ group: 'Patients', actions: patientActions });
  }
  if (serviceRequestActions.length > 0) {
    result.push({ group: 'Service Requests', actions: serviceRequestActions });
  }
  return result;
}
