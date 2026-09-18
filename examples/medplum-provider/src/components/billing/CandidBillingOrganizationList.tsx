// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { Operator, getIdentifier } from '@medplum/core';
import type { Organization, Resource } from '@medplum/fhirtypes';
import type { SearchControlAdditionalColumn } from '@medplum/react';
import { SearchControl } from '@medplum/react';
import { IconBuilding, IconFilePlus, IconInfoCircle } from '@tabler/icons-react';
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

/**
 * Props for the billing organization list. `onNewOrganization` opens the modal for a new organization and
 * `onAddExisting` the picker for an organization already in the project; the list draws both actions itself,
 * in place of the search control toolbar, which only knows how to offer New.
 */
export interface CandidBillingOrganizationListProps {
  readonly candidBotId: string | undefined;
  readonly savedVersion: number;
  readonly onNewOrganization: () => void;
  readonly onAddExisting: () => void;
  readonly onSelectOrganization: (organization: WithId<Organization>) => void;
}

export function CandidBillingOrganizationList(props: CandidBillingOrganizationListProps): JSX.Element {
  const { candidBotId, savedVersion, onNewOrganization, onAddExisting, onSelectOrganization } = props;
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);

  const additionalColumns: SearchControlAdditionalColumn[] = [
    { name: 'NPI', renderCell: (resource) => getIdentifier(resource, NPI_SYSTEM) },
    { name: 'Tax ID', renderCell: (resource) => getIdentifier(resource, EIN_SYSTEM) },
    { name: 'Status', renderCell: renderStatus },
  ];

  return (
    <Stack gap="sm">
      <Group gap={2}>
        <Button
          size="compact-md"
          variant="subtle"
          color="gray"
          leftSection={<IconFilePlus size={16} />}
          onClick={onNewOrganization}
        >
          New...
        </Button>
        <Button
          size="compact-md"
          variant="subtle"
          color="gray"
          leftSection={<IconBuilding size={16} />}
          onClick={onAddExisting}
        >
          Add existing...
        </Button>
      </Group>
      <SearchControl
        key={savedVersion}
        search={search}
        additionalColumns={additionalColumns}
        hideToolbar
        hideFilters
        onChange={(e) => setSearch(e.definition)}
        onClick={(e) => onSelectOrganization(e.resource as WithId<Organization>)}
      />

      <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
        {candidBotId
          ? 'Saving an organization here also registers it with Candid as an organization provider. Its payer contracts are still set up in the Candid portal; open an organization to see which are active.'
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
