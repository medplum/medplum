// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Text, Title } from '@mantine/core';
import { Document, SearchControl, useMedplumNavigate } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX } from 'react';
import { Outlet } from 'react-router';
import { useAdminStatus } from '../utils/admin';

/**
 * A page component that displays a searchable list of all clinics in the system.
 * Shows clinics accessible to the current user in the current project context.
 * Provides search functionality and navigation to individual clinic details.
 *
 * @returns The clinics listing page
 */
export function ClinicPage(): JSX.Element {
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const navigate = useMedplumNavigate();

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Title>Manage Clinics</Title>
        <Text>Loading...</Text>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Title>Manage Clinics</Title>
        <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
          You need to be an Admin to view this page. Please contact your system administrator for access.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Title>Manage Clinics</Title>
      <Text>Select a clinic to manage</Text>
      <SearchControl
        search={{
          resourceType: 'Organization',
          fields: ['name', '_lastUpdated'],
          sortRules: [
            {
              code: 'name',
              descending: false,
            },
          ],
        }}
        onClick={(e) => navigate(`/Organization/${e.resource.id}/manage`)}
        hideToolbar={true}
      />
      <Outlet />
    </Document>
  );
}
