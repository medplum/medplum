// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { HealthcareService } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAdminStatus } from '../utils/admin';

/**
 * A page component for creating a new healthcare service in the system.
 * Provides a form for entering healthcare service details and handles the creation process.
 *
 * @returns The new healthcare service creation page
 */
export function NewClinicPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [name, setName] = useState<string>('');
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const handleCreateHealthcareService = async (): Promise<void> => {
    if (!name) {
      return;
    }

    try {
      await medplum.createResource<HealthcareService>({
        resourceType: 'HealthcareService',
        name: name,
        active: true,
        identifier: [
          {
            system: 'https://example.org/identifiers',
            value: name.toLowerCase().replace(/\s+/g, '-'),
          },
        ],
      });

      showNotification({
        title: 'Success',
        message: 'Healthcare service created successfully',
        color: 'green',
      });

      // Navigate to the new healthcare service's page
      navigate('/HealthcareService')?.catch(console.error);
    } catch (error) {
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    }
  };

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Stack gap="md">
          <Title>Create New Healthcare Service</Title>
          <Text>Loading...</Text>
        </Stack>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Stack gap="md">
          <Title>Create New Healthcare Service</Title>
          <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
            You need to be an Admin to view this page. Please contact your system administrator for access.
          </Alert>
        </Stack>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="md">
        <Title>Create New Healthcare Service</Title>
        <TextInput
          label="Healthcare Service Name"
          placeholder="Enter healthcare service name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button onClick={handleCreateHealthcareService} disabled={!name}>
          Create Healthcare Service
        </Button>
      </Stack>
    </Document>
  );
}
