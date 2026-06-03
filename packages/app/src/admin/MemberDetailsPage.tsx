// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import type { User } from '@medplum/fhirtypes';
import { Loading, MedplumLink, ResourceTable, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function MemberDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const { membershipId } = useParams() as { membershipId: string };
  const membership = medplum.readResource('ProjectMembership', membershipId).read();
  const profile = useResource(membership.profile);
  const userRef = membership.user?.reference?.startsWith('User/')
    ? { reference: membership.user.reference }
    : undefined;
  const user = useResource<User>(userRef);
  if (!profile) {
    return <Loading />;
  }

  return (
    <>
      <Title>ProjectMembership Details</Title>
      <MedplumLink to={membership}>Go to ProjectMembership</MedplumLink>
      <ResourceTable value={membership} />
      <Title mt="md">Profile Details</Title>
      <MedplumLink to={profile}>Go to {profile.resourceType}</MedplumLink>
      <ResourceTable value={profile} ignoreMissingValues />
      {membership.user?.reference?.startsWith('User/') && (
        <>
          <Title mt="md">User Details</Title>
          {user?.project ? (
            <>
              <MedplumLink to={`/User/${user.id}/email`}>Change login email</MedplumLink>
              <ResourceTable value={user} ignoreMissingValues />
            </>
          ) : (
            <Alert color="yellow">This User is server-scoped and cannot be viewed in this project.</Alert>
          )}
        </>
      )}
    </>
  );
}
