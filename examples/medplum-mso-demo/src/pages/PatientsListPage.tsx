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
 * Patient page component for the MSO demo.
 * Displays a list of patients accessible to the current user in the current project context.
 * Provides search functionality by name, with navigation to patient details.
 *
 * @returns The patients listing page
 */
export function PatientPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>Patients</Title>
      <Text mb="sm">
        Here are the Patients accessible to <ResourceName value={profile} link /> in{' '}
        <ResourceName value={project} link />
      </Text>
      <SearchControl
        search={{ resourceType: 'Patient', fields: ['name'] }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
