// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Skeleton } from '@mantine/core';
import { DescriptionList, DescriptionListEntry } from '@medplum/react';
import type { JSX } from 'react';
import type { UserScope } from './useUserScope';

export interface UserScopeWidgetProps {
  readonly scope: UserScope;
}

export function UserScopeWidget(props: UserScopeWidgetProps): JSX.Element {
  const { scope } = props;
  return (
    <DescriptionList>
      <DescriptionListEntry term="Scope">
        {scope === 'loading' ? (
          <Skeleton height={22} width={70} radius="xl" />
        ) : scope === 'project' ? (
          <Badge color="blue" variant="light">
            Project
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            Global
          </Badge>
        )}
      </DescriptionListEntry>
    </DescriptionList>
  );
}
