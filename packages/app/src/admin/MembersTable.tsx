// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import { SegmentedControl } from '@mantine/core';
import { SearchControl, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';

const profileTypeOptions = [
  { label: 'All', value: 'Patient,Practitioner,RelatedPerson' },
  { label: 'Practitioner', value: 'Practitioner' },
  { label: 'Patient', value: 'Patient' },
  { label: 'RelatedPerson', value: 'RelatedPerson' },
];

export interface MemberTableProps {
  readonly fields: string[];
}

export function MemberTable(props: MemberTableProps): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();
  const [profileType, setProfileType] = useState('Patient,Practitioner,RelatedPerson');

  const [search, setSearch] = useState<SearchRequest>({
    resourceType: 'ProjectMembership',
    filters: [
      { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
      { code: 'profile-type', operator: Operator.EQUALS, value: profileType },
    ],
    fields: props.fields,
    count: 100,
  });

  function handleProfileTypeChange(value: string): void {
    setProfileType(value);
    setSearch({
      ...search,
      filters: [
        { code: 'project', operator: Operator.EQUALS, value: 'Project/' + projectId },
        { code: 'profile-type', operator: Operator.EQUALS, value },
      ],
    });
  }

  return (
    <>
      <SegmentedControl
        mb="md"
        value={profileType}
        onChange={handleProfileTypeChange}
        data={profileTypeOptions}
      />
      <SearchControl
        search={search}
        onClick={(e) => navigate(`/ProjectMembership/${e.resource.id}`)?.catch(console.error)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
        hideToolbar
      />
    </>
  );
}
