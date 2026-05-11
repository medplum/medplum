// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Skeleton } from '@mantine/core';
import type { JSX } from 'react';

export type UserScope = 'loading' | 'project' | 'global';

export interface UserScopeWidgetProps {
  readonly scope: UserScope;
}

export function UserScopeWidget(props: UserScopeWidgetProps): JSX.Element {
  const { scope } = props;
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
