// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Text, Title } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Practitioner } from '@medplum/fhirtypes';
import {
  Document,
  ResourceName,
  SearchControl,
  useMedplum,
  useMedplumNavigate,
  useMedplumProfile,
} from '@medplum/react';
import { JSX } from 'react';
import { Outlet } from 'react-router';

/**
 * A page component that displays a searchable list of clinical encounters.
 * Shows encounters accessible to the current user in the current project context.
 * Provides search functionality by type, subject, and participants, with navigation to encounter details.
 *
 * @returns The encounters listing page
 */
export function EncounterPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>Encounters</Title>
      <Text mb="sm">
        Here are the Encounters accessible to <ResourceName value={profile} link /> in{' '}
        <ResourceName value={project} link />
      </Text>
      <SearchControl
        search={{
          resourceType: 'Encounter',
          fields: ['reasonCode', 'subject', 'status'],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
