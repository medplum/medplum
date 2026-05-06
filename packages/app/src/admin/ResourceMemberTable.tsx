// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import type { ResourceType } from '@medplum/fhirtypes';
import { SearchControl, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';

export interface ResourceMemberTableProps {
  readonly resourceType?: ResourceType;
  readonly fields: string[];
}

export function ResourceMemberTable(props: ResourceMemberTableProps): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();

  const filters = [
    { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
    {
      code: 'profile-type',
      operator: Operator.EQUALS,
      value: props.resourceType ?? 'Patient,Practitioner,RelatedPerson',
    },
  ];

  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ProjectMembership',
    filters,
    fields: props.fields,
    count: 100,
  });

  return (
    <SearchControl
      search={search}
      onClick={(e) => navigate(`/ProjectMembership/${e.resource.id}`)}
      onChange={(e) => setSearch(e.definition)}
      hideFilters
      hideToolbar
    />
  );
}
