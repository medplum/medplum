// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Group, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { User } from '@medplum/fhirtypes';
import { Loading, MedplumLink, ResourceTable, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { getProjectId } from '../utils';

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
  const userRef = membership.user?.reference?.startsWith('User/')
    ? { reference: membership.user.reference }
    : undefined;
  const user = useResource<User>(userRef);
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
      {membership.user?.reference?.startsWith('User/') && (
        <>
          <Title mt="md">User Details</Title>
          {user?.project ? (
            <>
              <MedplumLink to={`/User/${user.id}/email`}>Go to User (change login email)</MedplumLink>
              <ResourceTable value={user} ignoreMissingValues />
            </>
          ) : (
            <Alert color="yellow">This User is server-scoped and cannot be viewed in this project.</Alert>
          )}
        </>
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
