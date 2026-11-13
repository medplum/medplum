// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { isNotFound } from '@medplum/core';
import type { OperationOutcome, User } from '@medplum/fhirtypes';
import { Loading, MedplumLink, OperationOutcomeAlert, ResourceTable } from '@medplum/react';
import type { JSX } from 'react';

interface MembershipUserDetailsProps {
  user?: WithId<User>;
  outcome?: OperationOutcome;
}

export function MembershipUserDetails({ user, outcome }: MembershipUserDetailsProps): JSX.Element {
  return (
    <>
      <Title mt="md">User Details</Title>
      <MembershipUserContent user={user} outcome={outcome} />
    </>
  );
}

function MembershipUserContent({ user, outcome }: MembershipUserDetailsProps): JSX.Element {
  if (user) {
    return (
      <>
        {user.project ? (
          <MedplumLink to={`/User/${user.id}/email`}>Go to User (change login email)</MedplumLink>
        ) : (
          <Alert color="blue">This User is server-scoped.</Alert>
        )}
        <ResourceTable value={user} ignoreMissingValues />
      </>
    );
  }

  if (outcome) {
    // Project admins get not-found for server-scoped Users
    return isNotFound(outcome) ? (
      <Alert color="yellow">This User could not be found in this project. It is likely server-scoped.</Alert>
    ) : (
      <OperationOutcomeAlert outcome={outcome} />
    );
  }

  return <Loading />;
}
