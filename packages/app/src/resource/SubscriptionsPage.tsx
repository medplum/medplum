import { Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { Document, MemoizedSearchControl } from '@medplum/react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function SubscriptionsPage(): JSX.Element | null {
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'Subscription',
    filters: [{ code: 'url', operator: Operator.EQUALS, value: `${resourceType}/${id}` }],
    fields: ['id', 'criteria', 'status', '_lastUpdated'],
  });

  return (
    <Document>
      <MemoizedSearchControl
        search={search}
        onClick={(e) => navigate(`/${e.resource.resourceType}/${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
      />
    </Document>
  );
}
