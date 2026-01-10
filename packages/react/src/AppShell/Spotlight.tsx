// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Kbd, Stack, Text } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { SpotlightActionData, SpotlightActionGroupData } from '@mantine/spotlight';
import { Spotlight as MantineSpotlight } from '@mantine/spotlight';
import { formatHumanName, isUUID } from '@medplum/core';
import type { Patient, ServiceRequest, ValueSetExpansionContains } from '@medplum/fhirtypes';
import type { MedplumNavigateFunction } from '@medplum/react-hooks';
import { useMedplum, useMedplumNavigate } from '@medplum/react-hooks';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import classes from './Spotlight.module.css';
import { ResourceAvatar } from '../ResourceAvatar/ResourceAvatar';

const DEBOUNCE_MS = 200;

export type HeaderSearchTypes = Patient | ServiceRequest;

export interface SpotlightProps {
  readonly patientsOnly?: boolean;
}

interface SearchGraphQLResponse {
  readonly data: {
    readonly Patients1: Patient[] | undefined;
    readonly Patients2: Patient[] | undefined;
    readonly ServiceRequestList: ServiceRequest[] | undefined;
  };
}

function KeyboardHint(): JSX.Element {
  return (
    <Stack gap="xs" py="lg">
      <Text size="sm" c="dimmed">
        Press <Kbd>⌘</Kbd> + <Kbd>K</Kbd> to open Search next time.
      </Text>
      <Text size="sm" c="dimmed">
        (<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> on Windows)
      </Text>
    </Stack>
  );
}

export function Spotlight({ patientsOnly }: SpotlightProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useMedplumNavigate();
  const [nothingFoundMessage, setNothingFoundMessage] = useState<React.ReactNode>(<KeyboardHint />);
  const [actions, setActions] = useState<SpotlightActionGroupData[]>([]);

  const debouncedSearch = useDebouncedCallback((query: string) => {
    const graphqlQuery = buildGraphQLQuery(query);

    if (patientsOnly) {
      // Only search patients
      medplum
        .graphql(graphqlQuery)
        .then((response: SearchGraphQLResponse) => {
          const resources = getResourcesFromResponse(response);
          const patients = resources.filter((r): r is Patient => r.resourceType === 'Patient');
          setActions(patientsToActions(patients, navigate));
        })
        .catch(console.error)
        .finally(() => setNothingFoundMessage('No results found'));
    } else {
      // Search patients, service requests, and resource types
      Promise.all([
        medplum.graphql(graphqlQuery),
        medplum.valueSetExpand({
          url: 'https://medplum.com/fhir/ValueSet/resource-types',
          filter: query,
          count: 5,
        }),
      ])
        .then(([graphqlResponse, valueSetResult]) => {
          const resources = getResourcesFromResponse(graphqlResponse as SearchGraphQLResponse);
          const resourceTypes = valueSetResult.expansion?.contains ?? [];
          setActions(resourcesToActions(resources, resourceTypes, navigate));
        })
        .catch(console.error)
        .finally(() => setNothingFoundMessage('No results found'));
    }
  }, DEBOUNCE_MS);

  const handleQueryChange = (query: string): void => {
    if (!query) {
      debouncedSearch.cancel();
      setNothingFoundMessage(<KeyboardHint />);
      setActions([]);
      return;
    }

    setNothingFoundMessage('Searching...');
    debouncedSearch(query);
  };

  return (
    <MantineSpotlight
      actions={actions}
      nothingFound={nothingFoundMessage}
      radius="md"
      highlightQuery
      searchProps={
        {
          leftSection: <IconSearch size="1.2rem" stroke={2} color="var(--mantine-color-gray-5)" />,
          placeholder: 'Start typing to search…',
          type: 'search',
          autoComplete: 'off',
          autoCorrect: 'off',
          spellCheck: false,
          name: patientsOnly ? 'provider-spotlight-search' : 'spotlight-search',
          inputProps: {
            // Tell common password managers to ignore this field
            'data-1p-ignore': 'true',
            'data-lpignore': 'true',
          },
          leftSectionProps: {
            style: { marginLeft: 'calc(var(--mantine-spacing-md) - 12px)' },
          },
        } as any
      }
      classNames={{
        body: classes.body,
        content: classes.content,
        search: classes.search,
        actionsList: classes.actionsList,
        action: classes.action,
        actionSection: classes.actionSection,
        actionDescription: classes.actionDescription,
        actionsGroup: classes.actionsGroup,
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
        identifier { system value }
        name { given family }
        birthDate
        photo { url contentType }
      }
      ServiceRequestList(_id: ${escaped}, _count: 1) {
        resourceType
        id
        identifier { system value }
        subject { display }
      }
    }`.replaceAll(/\s+/g, ' ');
  }
  return `{
    Patients1: PatientList(name: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      name { given family }
      birthDate
      photo { url contentType }
    }
    Patients2: PatientList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      name { given family }
      birthDate
      photo { url contentType }
    }
    ServiceRequestList(identifier: ${escaped}, _count: 5) {
      resourceType
      id
      identifier { system value }
      subject { display }
    }
  }`.replaceAll(/\s+/g, ' ');
}

function getResourcesFromResponse(response: SearchGraphQLResponse): HeaderSearchTypes[] {
  const resources: HeaderSearchTypes[] = [];
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

function dedupeResources(resources: HeaderSearchTypes[]): HeaderSearchTypes[] {
  const ids = new Set<string>();
  const result: HeaderSearchTypes[] = [];
  for (const resource of resources) {
    if (resource.id && !ids.has(resource.id)) {
      ids.add(resource.id);
      result.push(resource);
    }
  }
  return result;
}

function patientsToActions(patients: Patient[], navigate: MedplumNavigateFunction): SpotlightActionGroupData[] {
  const patientActions: SpotlightActionData[] = patients
    .filter((p): p is Patient & { id: string } => Boolean(p.id))
    .map((patient) => ({
      id: patient.id,
      label: patient.name ? formatHumanName(patient.name[0]) : patient.id,
      description: patient.birthDate,
      leftSection: <ResourceAvatar value={patient} radius="xl" size={24} />,
      onClick: () => navigate(`/Patient/${patient.id}`),
    }));

  return patientActions.length > 0 ? [{ group: 'Patients', actions: patientActions }] : [];
}

function resourcesToActions(
  resources: HeaderSearchTypes[],
  resourceTypes: ValueSetExpansionContains[],
  navigate: MedplumNavigateFunction
): SpotlightActionGroupData[] {
  const result: SpotlightActionGroupData[] = [];

  // Resource types
  const resourceTypeActions: SpotlightActionData[] = resourceTypes.map((rt) => ({
    id: `resource-type-${rt.code}`,
    label: rt.display ?? rt.code ?? '',
    description: 'Resource Type',
    onClick: () => navigate(`/${rt.code}`),
  }));
  if (resourceTypeActions.length > 0) {
    result.push({ group: 'Resource Types', actions: resourceTypeActions });
  }

  const patientActions: SpotlightActionData[] = [];
  const serviceRequestActions: SpotlightActionData[] = [];

  for (const resource of resources) {
    if (resource.resourceType === 'Patient' && resource.id) {
      patientActions.push({
        id: resource.id,
        label: resource.name ? formatHumanName(resource.name[0]) : resource.id,
        description: resource.birthDate,
        leftSection: <ResourceAvatar value={resource} radius="xl" size={24} />,
        onClick: () => navigate(`/Patient/${resource.id}`),
      });
    } else if (resource.resourceType === 'ServiceRequest' && resource.id) {
      serviceRequestActions.push({
        id: resource.id,
        label: resource.id,
        description: resource.subject?.display,
        onClick: () => navigate(`/ServiceRequest/${resource.id}`),
      });
    }
  }

  if (patientActions.length > 0) {
    result.push({ group: 'Patients', actions: patientActions });
  }
  if (serviceRequestActions.length > 0) {
    result.push({ group: 'Service Requests', actions: serviceRequestActions });
  }

  return result;
}
