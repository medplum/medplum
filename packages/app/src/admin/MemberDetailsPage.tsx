// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Loading, MedplumLink, ResourceTable, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getProjectId } from '../utils';
import { AccountSecurityCard } from './AccountSecurity';
import { MembershipUserDetails } from './MembershipUserDetails';
import { useMembershipUser } from './useMembershipUser';

function getMemberListPath(pathname: string): string {
  if (pathname.includes('/admin/bots/')) {
    return '/admin/bots';
  }
  if (pathname.includes('/admin/clients/')) {
    return '/admin/clients';
  }
  return '/admin/users';
}

export function MemberDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const location = useLocation();
  const { membershipId } = useParams() as { membershipId: string };
  const projectId = getProjectId(medplum);
  const isAdmin = medplum.getProjectMembership()?.admin;
  const membership = medplum.readResource('ProjectMembership', membershipId).read();
  const profile = useResource(membership.profile);
  const { userRef, user, outcome: userOutcome } = useMembershipUser(membership);
  const isOwner = medplum.getProject()?.owner?.reference === membership.user?.reference;

  const listPath = getMemberListPath(location.pathname);

  const deleteMembership = useCallback((): void => {
    if (!window.confirm('Are you sure you want to remove this user from the project?')) {
      return;
    }

    medplum
      .delete(`admin/projects/${projectId}/members/${membershipId}`)
      .then(() => {
        medplum.invalidateSearches('ProjectMembership');
        navigate(listPath)?.catch(console.error);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, projectId, membershipId, navigate, listPath]);

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
      {userRef && <MembershipUserDetails user={user} outcome={userOutcome} />}
      {isAdmin && user?.project && projectId && (
        <AccountSecurityCard projectId={projectId} membershipId={membershipId} user={user} />
      )}
      {isAdmin && !isOwner && (
        <Group justify="flex-end" mt="xl">
          <Button type="button" color="red" variant="outline" onClick={deleteMembership}>
            Remove user
          </Button>
        </Group>
      )}
    </>
  );
}
