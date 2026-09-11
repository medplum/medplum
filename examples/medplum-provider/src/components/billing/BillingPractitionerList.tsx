// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Organization, Practitioner, PractitionerRole, Reference, Resource } from '@medplum/fhirtypes';
import type { SearchControlAdditionalColumn, SearchLoadEvent } from '@medplum/react';
import { ResourceName, SearchControl, useMedplum } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { EIN_SYSTEM, NPI_SYSTEM, isCompleteBillingAddress } from '../../utils/billing';
import { showErrorNotification } from '../../utils/notifications';

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'Practitioner',
  fields: ['name'],
  sortRules: [{ code: 'name' }],
  count: 10,
  offset: 0,
};

export interface BillingPractitionerListProps {
  readonly savedVersion: number;
  readonly onSelectPractitioner: (practitioner: WithId<Practitioner>, roles: WithId<PractitionerRole>[]) => void;
}

export function BillingPractitionerList(props: BillingPractitionerListProps): JSX.Element {
  const { savedVersion, onSelectPractitioner } = props;
  const medplum = useMedplum();
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);
  const [rolesByPractitioner, setRolesByPractitioner] = useState<Record<string, WithId<PractitionerRole>[]>>({});
  const roleRequest = useRef(0);

  const handleLoad = useCallback(
    (e: SearchLoadEvent): void => {
      const references = (e.response.entry ?? []).map((entry) => `Practitioner/${entry.resource?.id}`);
      const request = ++roleRequest.current;
      setRolesByPractitioner({});
      if (references.length === 0) {
        return;
      }
      const loadRoles = async (): Promise<void> => {
        const next: Record<string, WithId<PractitionerRole>[]> = Object.fromEntries(references.map((ref) => [ref, []]));
        for await (const roles of medplum.searchResourcePages('PractitionerRole', {
          practitioner: references.join(','),
          active: 'true',
          _count: '100',
        })) {
          for (const role of roles) {
            if (role.practitioner?.reference) {
              next[role.practitioner.reference]?.push(role);
            }
          }
        }
        if (request === roleRequest.current) {
          setRolesByPractitioner(next);
        }
      };
      loadRoles().catch(showErrorNotification);
    },
    [medplum]
  );

  const additionalColumns: SearchControlAdditionalColumn[] = [
    { name: 'NPI', renderCell: (resource) => getIdentifier(resource, NPI_SYSTEM) },
    {
      name: 'Bills under',
      renderCell: (resource) => {
        const roles = rolesByPractitioner[`Practitioner/${resource.id}`];
        if (!roles) {
          return (
            <Text c="dimmed" size="sm">
              Loading...
            </Text>
          );
        }
        const organizations = new Map<string, Reference<Organization>>();
        for (const role of roles) {
          if (role.organization) {
            const organization = role.organization;
            const key = organization.reference ?? JSON.stringify(organization.identifier ?? organization);
            if (!organizations.has(key)) {
              organizations.set(key, organization);
            }
          }
        }
        return (
          <Stack gap={4}>
            {Array.from(organizations, ([key, organization]) => (
              <div key={key}>{organization.display ?? <ResourceName value={organization} />}</div>
            ))}
            {billsIndividually(roles) && (
              <Text c="dimmed" size="sm">
                Individually
              </Text>
            )}
          </Stack>
        );
      },
    },
    {
      name: 'Status',
      renderCell: (resource) =>
        renderStatus(resource, billsIndividually(rolesByPractitioner[`Practitioner/${resource.id}`])),
    },
  ];

  return (
    <Stack gap="sm">
      <SearchControl
        key={savedVersion}
        search={search}
        additionalColumns={additionalColumns}
        hideFilters
        onLoad={handleLoad}
        onChange={(e) => setSearch(e.definition)}
        onClick={(e) => {
          const roles = rolesByPractitioner[`Practitioner/${e.resource.id}`];
          if (roles) {
            onSelectPractitioner(e.resource as WithId<Practitioner>, roles);
          }
        }}
      />

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        All practitioners in this project are listed here. Claims identify the practitioner as the rendering provider.
        “Bills under” shows all organizations linked to their active roles. “Individually” means they have an active
        role without an organization, or no active roles.
      </Alert>
    </Stack>
  );
}

function billsIndividually(roles: WithId<PractitionerRole>[] | undefined): boolean {
  return !!roles && (roles.length === 0 || roles.some((role) => !role.organization));
}

function renderStatus(resource: Resource, billsIndividually: boolean): JSX.Element {
  return (
    <Group gap={6}>
      {!getIdentifier(resource, NPI_SYSTEM) && (
        <Badge color="yellow" variant="light">
          Missing NPI
        </Badge>
      )}
      {billsIndividually && !getIdentifier(resource, EIN_SYSTEM) && (
        <Badge color="yellow" variant="light">
          Missing Tax ID
        </Badge>
      )}
      {billsIndividually && !isCompleteBillingAddress((resource as Practitioner).address?.[0]) && (
        <Badge color="yellow" variant="light">
          Incomplete address
        </Badge>
      )}
    </Group>
  );
}
