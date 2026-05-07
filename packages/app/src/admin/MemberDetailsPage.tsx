// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Divider, Title } from '@mantine/core';
import { resolveId } from '@medplum/core';
import { Loading, MedplumLink, ResourceTable, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';
import { getProjectId } from '../utils';
import { ReleaseUserToGlobalScopeWidget } from './ReleaseUserToGlobalScopeWidget';
import { UserScopeWidget } from './UserScopeWidget';
import { useUserScope } from './useUserScope';

export function MemberDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const { membershipId } = useParams() as { membershipId: string };
  const membership = medplum.readResource('ProjectMembership', membershipId).read();
  const profile = useResource(membership.profile);
  const projectId = getProjectId(medplum);
  const userId = membership.user?.reference?.startsWith('User/') ? resolveId(membership.user) : undefined;
  const [scope, refreshScope] = useUserScope(userId, projectId);

  if (!profile) {
    return <Loading />;
  }

  const showRescope = medplum.isProjectAdmin() && userId && scope === 'project';

  return (
    <>
      <Title>ProjectMembership Details</Title>
      <MedplumLink to={membership}>Go to ProjectMembership</MedplumLink>
      <ResourceTable value={membership} />
      <Title mt="md">Profile Details</Title>
      <MedplumLink to={profile}>Go to {profile.resourceType}</MedplumLink>
      <ResourceTable value={profile} ignoreMissingValues />
      {userId && (
        <>
          <Title mt="md">User Details</Title>
          <UserScopeWidget scope={scope} />
          {showRescope && (
            <>
              <Divider my="lg" />
              <ReleaseUserToGlobalScopeWidget userId={userId} onSuccess={refreshScope} />
            </>
          )}
        </>
      )}
    </>
  );
}
