// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { Document, SearchControl } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { useAppNavigate } from '../useAppNavigate';

export function SubscriptionsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const navigate = useAppNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Subscription',
    filters: [{ code: 'url', operator: Operator.EQUALS, value: `${resourceType}/${id}` }],
    fields: ['id', 'criteria', 'status', '_lastUpdated'],
  });

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
      />
    </Document>
  );
}
