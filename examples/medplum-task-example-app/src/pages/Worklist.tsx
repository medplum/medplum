import { getReferenceString, Operator, SearchRequest } from '@medplum/core';
import { Resource } from '@medplum/fhirtypes';
import { Document, SearchControl, useMedplumProfile } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export function Worklist(): JSX.Element {
  const profile = useMedplumProfile() as Resource;
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({ resourceType: 'Task' });

  useEffect(() => {
    const filters = [{ code: 'owner', operator: Operator.EQUALS, value: `${getReferenceString(profile)}` }];
    const fields = ['id', '_lastUpdated', 'owner', 'priority', 'for'];
    const sort = [{ code: '-priority-order' }];

    const populatedSearch = {
      ...search,
      filters,
      fields,
      sort,
    };

    setSearch(populatedSearch);
  }, []);

  return (
    <Document>
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar={true}
        hideFilters={true}
      />
    </Document>
  );
}
