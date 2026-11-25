// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// start-block example
import { Text } from '@mantine/core';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX, ReactNode } from 'react';
import { Fragment } from 'react';

export function AuthenticationBoundary(props: { signIn: ReactNode; children: ReactNode }): JSX.Element {
  const medplum = useMedplum();
  const profile = useMedplumProfile();

  if (medplum.isLoading()) {
    return <Text role="status">Loading your session...</Text>;
  }
  if (!profile) {
    return <>{props.signIn}</>;
  }

  return <Fragment key={medplum.getProjectMembership()?.id}>{props.children}</Fragment>;
}
// end-block example
