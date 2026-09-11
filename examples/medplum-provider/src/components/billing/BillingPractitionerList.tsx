// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Group, Stack, Text } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { getIdentifier } from '@medplum/core';
import type { Organization, Practitioner, Reference, Resource } from '@medplum/fhirtypes';
import type { SearchControlAdditionalColumn, SearchLoadEvent } from '@medplum/react';
import { ResourceName, SearchControl, useMedplum } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
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
  readonly onSelectPractitioner: (
    practitioner: WithId<Practitioner>,
    billingOrganization: Reference<Organization> | undefined
  ) => void;
}

export function BillingPractitionerList(props: BillingPractitionerListProps): JSX.Element {
  const { savedVersion, onSelectPractitioner } = props;
  const medplum = useMedplum();
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);
  const [billsUnder, setBillsUnder] = useState<Record<string, Reference<Organization>>>({});

  const handleLoad = useCallback(
    (e: SearchLoadEvent): void => {
      const references = (e.response.entry ?? []).map((entry) => `Practitioner/${entry.resource?.id}`);
      if (references.length === 0) {
        setBillsUnder({});
        return;
      }
      medplum
        .searchResources('PractitionerRole', { practitioner: references.join(','), active: 'true', _count: '100' })
        .then((roles) => {
          const next: Record<string, Reference<Organization>> = {};
          for (const role of roles) {
            if (role.practitioner?.reference && role.organization) {
              next[role.practitioner.reference] = role.organization;
            }
          }
          setBillsUnder(next);
        })
        .catch(showErrorNotification);
    },
    [medplum]
  );

  const additionalColumns: SearchControlAdditionalColumn[] = [
    { name: 'NPI', renderCell: (resource) => getIdentifier(resource, NPI_SYSTEM) },
    {
      name: 'Bills under',
      renderCell: (resource) => {
        const organization = billsUnder[`Practitioner/${resource.id}`];
        if (!organization) {
          return (
            <Text c="dimmed" size="sm">
              Individually
            </Text>
          );
        }
        return organization.display ?? <ResourceName value={organization} />;
      },
    },
    {
      name: 'Status',
      renderCell: (resource) => renderStatus(resource, !billsUnder[`Practitioner/${resource.id}`]),
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
        onClick={(e) =>
          onSelectPractitioner(e.resource as WithId<Practitioner>, billsUnder[`Practitioner/${e.resource.id}`])
        }
      />

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        Every practitioner in the project is listed here. A claim names the practitioner as its rendering provider, and
        bills under the organization on their role — or under the practitioner themselves when they have none.
      </Alert>
    </Stack>
  );
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
