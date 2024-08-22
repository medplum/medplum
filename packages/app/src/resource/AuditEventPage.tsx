import { Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, SearchControl } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

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
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
      />
    </Document>
  );
}
