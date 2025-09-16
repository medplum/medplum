// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Alert, Box, Button, Code, CopyButton, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { JSX, useState } from 'react';
import { RESOURCES_BUNDLE } from '../data/core/sample-bundle';
import { useAdminStatus } from '../utils/admin';

/**
 * This page allows you to upload sample FHIR resources including 3 patients (A, B, and C) along with their
 * related Observations, Diagnostic Reports, Encounters, and Communications. All resources are properly linked
 * through the Patient compartment.
 *
 * This is useful for testing the access control policies and for demonstrating the functionality of the system.
 *
 * @returns The upload bundle page
 */
export function UploadBundlePage(): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [uploadedResources, setUploadedResources] = useState<string[]>([]);
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  const handleUpload = async (): Promise<void> => {
    setLoading(true);
    try {
      // Step 1: Create the patients
      const resourcesResponse = await medplum.executeBatch(RESOURCES_BUNDLE);

      // Combine all created resources for display
      const allResources = [
        // ...patients.map((patient) => `Patient/${patient.id}`),
        ...(resourcesResponse.entry?.map((entry) => {
          const resource = entry.resource;
          if (resource) {
            return `${resource.resourceType}/${resource.id}`;
          }
          return 'Unknown resource';
        }) || []),
      ].filter(Boolean);

      setUploadedResources(allResources);

      showNotification({
        title: 'Success',
        message: `Successfully uploaded ${allResources.length} resources`,
        color: 'green',
      });
    } catch (error) {
      console.error('Error uploading resources:', normalizeErrorString(error));
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // If still checking admin status, show loading
  if (adminLoading) {
    return (
      <Document>
        <Stack gap="lg">
          <Title>Upload FHIR Resources</Title>
          <Text>Loading...</Text>
        </Stack>
      </Document>
    );
  }

  // If user is not an admin, show access denied message
  if (!isAdmin) {
    return (
      <Document>
        <Stack gap="lg">
          <Title>Upload FHIR Resources</Title>
          <Alert icon={<IconAlertCircle size={16} />} title="Access Denied" color="red">
            You need to be an Admin to view this page.
          </Alert>
        </Stack>
      </Document>
    );
  }

  return (
    <Document>
      <Stack gap="lg">
        <Title>Upload FHIR Resources</Title>

        <Text>
          This page allows you to upload sample FHIR resources including 3 patients (A, B, and C) along with their
          related Observations, Diagnostic Reports, Encounters, and Communications. All resources are properly linked
          through the Patient compartment.
        </Text>

        <Button onClick={handleUpload} loading={loading} disabled={uploadedResources.length > 0}>
          {uploadedResources.length > 0 ? 'Resources Uploaded' : 'Upload Resources'}
        </Button>

        {uploadedResources.length > 0 && (
          <Box>
            <Title order={3}>Uploaded Resources ({uploadedResources.length})</Title>
            <Text size="sm" color="dimmed">
              The following resources were created:
            </Text>
            <Box style={{ maxHeight: '400px', overflow: 'auto' }}>
              <Code block>{uploadedResources.join('\n')}</Code>
            </Box>
          </Box>
        )}

        <Box pos="relative">
          <Title order={3}>Sample Bundles</Title>
          <Text size="sm" color="dimmed">
            These are the FHIR bundles that will be uploaded:
          </Text>

          <Title order={4} mt="md">
            Resources Bundle
          </Title>
          <Box pos="relative">
            <Code block>{JSON.stringify(RESOURCES_BUNDLE, null, 2)}</Code>
            <CopyButton value={JSON.stringify(RESOURCES_BUNDLE, null, 2)} timeout={2000}>
              {({ copied, copy }) => (
                <ActionIcon
                  color={copied ? 'teal' : 'gray'}
                  variant="subtle"
                  onClick={copy}
                  pos="absolute"
                  top={8}
                  right={8}
                >
                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                </ActionIcon>
              )}
            </CopyButton>
          </Box>
        </Box>
      </Stack>
    </Document>
  );
}
