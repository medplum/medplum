// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, SegmentedControl } from '@mantine/core';
import type { SearchRequest } from '@medplum/core';
import { Operator } from '@medplum/core';
import { SearchControl, useMedplum } from '@medplum/react';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { getProjectId } from '../utils';

export interface ProfileTypeOption {
  readonly label: string;
  readonly value: string;
}

export interface MemberTableProps {
  readonly profileTypeOptions: ProfileTypeOption[];
  readonly fields: string[];
  readonly toolbarLeft?: ReactNode;
  readonly toolbarRight?: ReactNode;
}

export function MemberTable(props: MemberTableProps): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const navigate = useNavigate();
  const [profileType, setProfileType] = useState(props.profileTypeOptions[0].value);

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

  const showSegmentedControl = props.profileTypeOptions.length > 1;
  const showToolbar =
    showSegmentedControl || props.toolbarLeft !== undefined || props.toolbarRight !== undefined;

  return (
    <>
      {showToolbar && (
        <Group justify="space-between" align="center" mb="md" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            {showSegmentedControl && (
              <SegmentedControl value={profileType} onChange={handleProfileTypeChange} data={props.profileTypeOptions} />
            )}
            {props.toolbarLeft}
          </Group>
          {props.toolbarRight}
        </Group>
      )}
      <SearchControl
        search={search}
        onClick={(e) => navigate(`./${e.resource.id}`)}
        onChange={(e) => setSearch(e.definition)}
        hideFilters
        hideToolbar
      />
    </>
  );
}
