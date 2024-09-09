import { Operator, SearchRequest } from '@medplum/core';
import { ResourceType } from '@medplum/fhirtypes';
import { SearchControl, useMedplum } from '@medplum/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjectId } from '../utils';

export interface MemberTableProps {
  readonly resourceType: ResourceType;
  readonly fields: string[];
}

export function MemberTable(props: MemberTableProps): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();
  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ProjectMembership',
    filters: [
      { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
      { code: 'profile-type', operator: Operator.EQUALS, value: props.resourceType },
    ],
    fields: props.fields,
    count: 100,
  });

  return (
    <SearchControl
      search={search}
      onClick={(e) => navigate(`/admin/members/${e.resource.id}`)}
      onChange={(e) => setSearch(e.definition)}
      hideFilters
      hideToolbar
    />
  );
}
