import { Button, TextInput, Title, Stack, Alert, Text } from '@mantine/core';
import { useMedplum, Document } from '@medplum/react';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Organization } from '@medplum/fhirtypes';
import '@mantine/notifications/styles.css';
import { useAdminStatus } from '../utils/admin';
import { IconAlertCircle } from '@tabler/icons-react';

/**
 * A page component for creating a new clinic in the system.
 * Provides a form for entering clinic details and handles the creation process.
 *
 * @returns The new clinic creation page
 */
export function NewClinicPage(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const [name, setName] = useState<string>('');
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const handleCreateClinic = async (): Promise<void> => {
    if (!name) {
      return;
    }

    try {
      await medplum.createResource<Organization>({
        resourceType: 'Organization',
        name: name,
        active: true,
      });

      showNotification({
        title: 'Success',
        message: 'Clinic created successfully',
        color: 'green',
      });

      // Navigate to the new organization's page
      navigate('/Organization')?.catch(console.error);
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
          <Title>Create New Clinic</Title>
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
          <Title>Create New Clinic</Title>
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
        <Title>Create New Clinic</Title>
        <TextInput
          label="Clinic Name"
          placeholder="Enter clinic name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button onClick={handleCreateClinic} disabled={!name}>
          Create Clinic
        </Button>
      </Stack>
    </Document>
  );
}
