// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Text, Title } from '@mantine/core';
import { Document, SearchControl, useMedplumNavigate } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX } from 'react';
import { Outlet } from 'react-router';
import { useAdminStatus } from '../utils/admin';

/**
 * A page component that displays a searchable list of all healthcare services in the system.
 * Shows healthcare services accessible to the current user in the current project context.
 * Provides search functionality and navigation to individual healthcare service details.
 *
 * @returns The healthcare services listing page
 */
export function ClinicPage(): JSX.Element {
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const navigate = useMedplumNavigate();

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Title>Manage Healthcare Services</Title>
        <Text>Loading...</Text>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Title>Manage Healthcare Services</Title>
        <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
          You need to be an Admin to view this page. Please contact your system administrator for access.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
        <Title>Manage Healthcare Services</Title>
        <Text>Select a healthcare service to manage</Text>
      <SearchControl
        search={{
          resourceType: 'HealthcareService',
          fields: ['name', '_lastUpdated'],
          sortRules: [
            {
              code: 'name',
              descending: false,
            },
          ],
        }}
        onClick={(e) => navigate(`/HealthcareService/${e.resource.id}/manage`)}
        hideToolbar={true}
      />
      <Outlet />
    </Document>
  );
}
