// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Skeleton } from '@mantine/core';
import { DescriptionList, DescriptionListEntry } from '@medplum/react';
import type { JSX } from 'react';
import type { UserScope } from './useUserScope';

export interface UserScopeWidgetProps {
  readonly scope: UserScope;
}

function renderScopeBadge(scope: UserScope): JSX.Element {
  if (scope === 'loading') {
    return <Skeleton height={22} width={70} radius="xl" />;
  }
  if (scope === 'project') {
    return (
      <Badge color="blue" variant="light">
        Project
      </Badge>
    );
  }
  return (
    <Badge color="gray" variant="light">
      Global
    </Badge>
  );
}

export function UserScopeWidget(props: UserScopeWidgetProps): JSX.Element {
  const { scope } = props;
  return (
    <DescriptionList>
      <DescriptionListEntry term="Scope">{renderScopeBadge(scope)}</DescriptionListEntry>
    </DescriptionList>
  );
}
