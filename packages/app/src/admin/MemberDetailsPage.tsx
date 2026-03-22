// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { Loading, MedplumLink, ResourceTable, useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useParams } from 'react-router';

export function MemberDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const { membershipId } = useParams() as { membershipId: string };
  const membership = medplum.readResource('ProjectMembership', membershipId).read();
  const profile = useResource(membership.profile);
  if (!profile) {
    return <Loading />;
  }

  return (
    <>
      <Title>ProjectMembership Details</Title>
      <MedplumLink to={membership}>Go to ProjectMembership</MedplumLink>
      <ResourceTable value={membership} ignoreMissingValues />
      <Title mt="md">{profile.resourceType} Details</Title>
      <MedplumLink to={profile}>Go to {profile.resourceType}</MedplumLink>
      <ResourceTable value={profile} ignoreMissingValues />
    </>
  );
}
