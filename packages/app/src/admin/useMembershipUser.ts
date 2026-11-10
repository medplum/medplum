// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { OperationOutcome, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useMemo, useState } from 'react';

export interface MembershipUser {
  userRef?: Reference<User>;
  user?: WithId<User>;
  outcome?: OperationOutcome;
}

export function useMembershipUser(membership: ProjectMembership): MembershipUser {
  const userReference = membership.user?.reference;
  // Memoized so useResource does not re-read on every render
  const userRef = useMemo(
    () => (userReference?.startsWith('User/') ? { reference: userReference } : undefined),
    [userReference]
  );
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const user = useResource<User>(userRef, setOutcome);
  return { userRef, user, outcome };
}
