// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, SearchControl } from '@medplum/react';
import { JSX, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

export function AuditEventPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'AuditEvent',
    filters: [{ code: 'entity', operator: Operator.EQUALS, value: `${resourceType}/${id}` }],
    fields: ['id', 'outcome', 'outcomeDesc', '_lastUpdated'],
    sortRules: [{ code: '-_lastUpdated' }],
    count: 20,
  });

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)?.catch(console.error)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
      />
    </Document>
  );
}
