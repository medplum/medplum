// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Stack, Text } from '@mantine/core';
import type { SearchRequest, WithId } from '@medplum/core';
import { Operator, getIdentifier } from '@medplum/core';
import type { Organization, Resource } from '@medplum/fhirtypes';
import type { SearchControlAdditionalColumn } from '@medplum/react';
import { SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import type { CandidPayerDirectory } from '../../hooks/useCandidPayerDirectory';
import { formatPayerCategory, getPayerCategory } from '../../utils/billing';
import { CANDID_PAYER_UUID_SYSTEM, CHC_PAYER_ID_SYSTEM, CMS_PAYER_ID_SYSTEM } from '../../utils/candid';

const DEFAULT_SEARCH: SearchRequest = {
  resourceType: 'Organization',
  // An imported payer is any Organization carrying a Candid payer UUID, whatever its value.
  filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${CANDID_PAYER_UUID_SYSTEM}|` }],
  fields: ['name'],
  sortRules: [{ code: 'name' }],
  count: 10,
  offset: 0,
};

export interface ImportedPayerListProps {
  readonly directory: CandidPayerDirectory;
  readonly onSelectPayer: (payer: WithId<Organization>) => void;
}

export function ImportedPayerList(props: ImportedPayerListProps): JSX.Element {
  const { directory, onSelectPayer } = props;
  const [search, setSearch] = useState<SearchRequest>(DEFAULT_SEARCH);

  const additionalColumns: SearchControlAdditionalColumn[] = [
    { name: 'Payer ID', renderCell: renderPayerId },
    { name: 'Category', renderCell: renderCategory },
    { name: 'Status', renderCell: renderStatus },
  ];

  return (
    <Stack gap="sm">
      <SearchControl
        // Remounting refetches, so the list picks up an import or a refresh from the directory.
        key={directory.payersVersion}
        search={search}
        additionalColumns={additionalColumns}
        hideFilters
        onChange={(e) => setSearch(e.definition)}
        onClick={(e) => onSelectPayer(e.resource as WithId<Organization>)}
      />

      <Text c="dimmed" size="sm">
        Import the payers you bill from the Candid payer directory.
      </Text>
    </Stack>
  );
}

function renderPayerId(resource: Resource): string | undefined {
  return getIdentifier(resource, CHC_PAYER_ID_SYSTEM) ?? getIdentifier(resource, CMS_PAYER_ID_SYSTEM);
}

function renderCategory(resource: Resource): string | undefined {
  const category = getPayerCategory(resource as Organization);
  return category && formatPayerCategory(category);
}

function renderStatus(resource: Resource): JSX.Element | undefined {
  if ((resource as Organization).active !== false) {
    return undefined;
  }
  return (
    <Badge color="gray" variant="light">
      Inactive
    </Badge>
  );
}
