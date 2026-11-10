// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Group, Stack, Title } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { isOk } from '@medplum/core';
import type { ProjectMembership, ResourceType, User } from '@medplum/fhirtypes';
import {
  Document,
  Loading,
  MedplumLink,
  OperationOutcomeAlert,
  ResourceTable,
  useMedplum,
  useResource,
  useSearchResources,
} from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function MembershipPage(): JSX.Element {
  const medplum = useMedplum();
  const { resourceType, id } = useParams() as { resourceType: ResourceType; id: string };
  const isAdmin = medplum.isProjectAdmin() || medplum.isSuperAdmin();
  const [memberships, loading, outcome] = useSearchResources(
    'ProjectMembership',
    { profile: `${resourceType}/${id}` },
    { enabled: isAdmin }
  );

  if (!isAdmin) {
    return (
      <Document>
        <Alert color="blue" title="Admin access required">
          You need project admin access to view the ProjectMembership and User for this resource.
        </Alert>
      </Document>
    );
  }

  if (outcome && !isOk(outcome)) {
    return (
      <Document>
        <OperationOutcomeAlert outcome={outcome} />
      </Document>
    );
  }

  if (loading || !memberships) {
    return (
      <Document>
        <Loading />
      </Document>
    );
  }

  return (
    <Document>
      <Title>ProjectMembership Details</Title>
      {memberships.length === 0 ? (
        <p>This resource does not have a ProjectMembership.</p>
      ) : (
        <Stack gap="xl" mt="md">
          {memberships.map((membership) => (
            <MembershipDetails key={membership.id} membership={membership} />
          ))}
        </Stack>
      )}
    </Document>
  );
}

function MembershipDetails({ membership }: { membership: WithId<ProjectMembership> }): JSX.Element {
  const userRef = membership.user?.reference?.startsWith('User/')
    ? { reference: membership.user.reference }
    : undefined;
  const user = useResource<User>(userRef);

  return (
    <Stack gap="sm">
      <Group gap="md">
        <MedplumLink to={membership}>Go to ProjectMembership</MedplumLink>
        <MedplumLink to={getAdminMemberPath(membership)}>View in project admin</MedplumLink>
      </Group>
      <ResourceTable value={membership} ignoreMissingValues />
      {userRef && (
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
    </Stack>
  );
}

function getAdminMemberPath(membership: WithId<ProjectMembership>): string {
  const profileType = membership.profile?.reference?.split('/')[0];
  if (profileType === 'Bot') {
    return `/admin/bots/${membership.id}`;
  }
  if (profileType === 'ClientApplication') {
    return `/admin/clients/${membership.id}`;
  }
  return `/admin/users/${membership.id}`;
}
