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
 * A page component that displays a searchable list of diagnostic reports.
 * Shows reports accessible to the current user in the current project context.
 * Provides search functionality by code, subject, and results, with navigation to report details.
 *
 * @returns The diagnostic reports listing page
 */
export function DiagnosticReportPage(): JSX.Element {
  const profile = useMedplumProfile() as Practitioner;
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useMedplumNavigate();

  return (
    <Document>
      <Title>Diagnostic Reports</Title>
      <Text mb="sm">
        Here are the Diagnostic Reports accessible to <ResourceName value={profile} link /> in{' '}
        <ResourceName value={project} link />
      </Text>
      <SearchControl
        search={{
          resourceType: 'DiagnosticReport',
          fields: ['code', 'subject'],
        }}
        onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
        hideToolbar
      />
      <Outlet />
    </Document>
  );
}
