// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { isReference } from '@medplum/core';
import type { OperationOutcome, ProjectMembership, Reference, User } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { useState } from 'react';

export interface MembershipUser {
  userRef?: Reference<User>;
  user?: WithId<User>;
  outcome?: OperationOutcome;
}

export function useMembershipUser(membership: ProjectMembership): MembershipUser {
  const userRef = isReference<User>(membership.user, 'User') ? membership.user : undefined;
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const user = useResource<User>(userRef, setOutcome);
  return { userRef, user, outcome };
}
