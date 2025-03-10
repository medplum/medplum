import { Button, Code, Stack, Text, Title, Box, ActionIcon, Alert } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { Document, useMedplum } from '@medplum/react';
import { useState } from 'react';
import '@mantine/notifications/styles.css';
import { IconCopy, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { CopyButton } from '@mantine/core';
import { useAdminStatus } from '../utils/admin';
import { PATIENTS_BUNDLE, createResourcesBundle } from '../data/core/sample-bundle';
import { Patient } from '@medplum/fhirtypes';

/**
 * This page allows you to upload sample FHIR resources including 3 patients (A, B, and C) along with their
 * related Observations, Diagnostic Reports, Encounters, and Communications. All resources are properly linked
 * through the Patient compartment.
 *
 * This is useful for testing the access control policies and for demonstrating the functionality of the system.
 * 
 * @component
 * @returns {JSX.Element} The upload bundle page
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
      const patientsResponse = await medplum.executeBatch(PATIENTS_BUNDLE);
      
      // Extract the created patients
      const patients = patientsResponse.entry?.map(entry => entry.resource as Patient) || [];
      
      if (patients.length !== 3) {
        throw new Error('Failed to create all patients');
      }
      
      // Step 2: Create resources referencing the patients
      const resourcesBundle = createResourcesBundle(patients);
      const resourcesResponse = await medplum.executeBatch(resourcesBundle);
      
      // Combine all created resources for display
      const allResources = [
        ...patients.map(patient => `Patient/${patient.id}`),
        ...(resourcesResponse.entry?.map(entry => {
          const resource = entry.resource;
          if (resource) {
            return `${resource.resourceType}/${resource.id}`;
          }
          return 'Unknown resource';
        }) || [])
      ].filter(Boolean);
      
      setUploadedResources(allResources);
      
      showNotification({
        title: 'Success',
        message: `Successfully uploaded ${allResources.length} resources`,
        color: 'green'
      });
    } catch (error) {
      console.error('Error uploading resources:', error);
      showNotification({
        title: 'Error',
        message: 'Failed to upload FHIR resources',
        color: 'red'
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
          <Alert 
            icon={<IconAlertCircle size={16} />} 
            title="Access Denied" 
            color="red"
          >
            You need to be an Admin to view this page.
          </Alert>
        </Stack>
      </Document>
    );
  }

  // Generate a sample resources bundle for display purposes
  const samplePatients = [
    { id: 'sample-id-1', resourceType: 'Patient' },
    { id: 'sample-id-2', resourceType: 'Patient' },
    { id: 'sample-id-3', resourceType: 'Patient' }
  ] as Patient[];
  
  const sampleResourcesBundle = createResourcesBundle(samplePatients);

  return (
    <Document>
      <Stack gap="lg">
        <Title>Upload FHIR Resources</Title>
        
        <Text>
          This page allows you to upload sample FHIR resources including 3 patients (A, B, and C) along with their
          related Observations, Diagnostic Reports, Encounters, and Communications. All resources are properly linked
          through the Patient compartment.
        </Text>

        <Button
          onClick={handleUpload}
          loading={loading}
          disabled={uploadedResources.length > 0}
        >
          {uploadedResources.length > 0 ? 'Resources Uploaded' : 'Upload Resources'}
        </Button>

        {uploadedResources.length > 0 && (
          <Box>
            <Title order={3}>Uploaded Resources ({uploadedResources.length})</Title>
            <Text size="sm" color="dimmed">The following resources were created:</Text>
            <Box style={{ maxHeight: '400px', overflow: 'auto' }}>
              <Code block>
                {uploadedResources.join('\n')}
              </Code>
            </Box>
          </Box>
        )}

        <Box pos="relative">
          <Title order={3}>Sample Bundles</Title>
          <Text size="sm" color="dimmed">These are the FHIR bundles that will be uploaded:</Text>
          
          <Title order={4} mt="md">Patients Bundle</Title>
          <Box pos="relative">
            <Code block>
              {JSON.stringify(PATIENTS_BUNDLE, null, 2)}
            </Code>
            <CopyButton value={JSON.stringify(PATIENTS_BUNDLE, null, 2)} timeout={2000}>
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
          
          <Title order={4} mt="md">Resources Bundle (with dynamic patient references)</Title>
          <Box pos="relative">
            <Code block>
              {JSON.stringify(sampleResourcesBundle, null, 2)}
            </Code>
            <CopyButton value={JSON.stringify(sampleResourcesBundle, null, 2)} timeout={2000}>
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