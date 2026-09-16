// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Group, Stack } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { Operator, getIdentifier } from '@medplum/core';
import type { Organization, Resource } from '@medplum/fhirtypes';
import type { SearchControlAdditionalColumn } from '@medplum/react';
import { SearchControl } from '@medplum/react';
import { IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import {
  BILLING_ORGANIZATION_IDENTIFIER_VALUE,
  EIN_SYSTEM,
  MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM,
  NPI_SYSTEM,
} from '../../utils/billing';

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'Organization',
  filters: [
    {
      code: 'identifier',
      operator: Operator.EQUALS,
      value: `${MEDPLUM_PROVIDER_IDENTIFIER_SYSTEM}|${BILLING_ORGANIZATION_IDENTIFIER_VALUE}`,
    },
  ],
  fields: ['name', 'address', 'telecom'],
  sortRules: [{ code: 'name' }],
  count: 10,
  offset: 0,
};

export interface BillingOrganizationListProps {
  readonly candidBotId: string | undefined;
  readonly savedVersion: number;
  readonly onNewOrganization: () => void;
  readonly onSelectOrganization: (organization: WithId<Organization>) => void;
}

export function BillingOrganizationList(props: BillingOrganizationListProps): JSX.Element {
  const { candidBotId, savedVersion, onNewOrganization, onSelectOrganization } = props;
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);

  const additionalColumns: SearchControlAdditionalColumn[] = [
    { name: 'NPI', renderCell: (resource) => getIdentifier(resource, NPI_SYSTEM) },
    { name: 'Tax ID', renderCell: (resource) => getIdentifier(resource, EIN_SYSTEM) },
    { name: 'Status', renderCell: renderStatus },
  ];

  return (
    <Stack gap="sm">
      <SearchControl
        key={savedVersion}
        search={search}
        additionalColumns={additionalColumns}
        hideFilters
        onChange={(e) => setSearch(e.definition)}
        onClick={(e) => onSelectOrganization(e.resource as WithId<Organization>)}
        onNew={onNewOrganization}
      />

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        {candidBotId
          ? 'Saving an organization here also registers it with Candid as an organization provider. Its payer contracts are still set up offline in the Candid portal.'
          : 'Candid requires the NPI and Tax ID entered here to match a provider registered in Candid with a payer contract, set up offline in the Candid portal.'}
      </Alert>
    </Stack>
  );
}

function renderStatus(resource: Resource): JSX.Element {
  return (
    <Group gap={6}>
      {!getIdentifier(resource, NPI_SYSTEM) && (
        <Badge color="yellow" variant="light">
          Missing NPI
        </Badge>
      )}
    </Group>
  );
}
