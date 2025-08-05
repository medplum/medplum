// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Alert, Box, Button, Code, CopyButton, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { normalizeErrorString } from '@medplum/core';
import { AccessPolicy } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertCircle, IconCheck, IconCopy } from '@tabler/icons-react';
import { JSX, useEffect, useState } from 'react';
import { MSO_ACCESS_POLICY } from '../data/core/access-policy';
import { useAdminStatus } from '../utils/admin';

/**
 * This page allows you to upload the Multi-Tenant Organization Access Policy required for the MSO demo.
 *
 * @returns The upload access policy page
 */
export function UploadAccessPolicyPage(): JSX.Element {
  const medplum = useMedplum();
  const [existingPolicy, setExistingPolicy] = useState<AccessPolicy | undefined>();
  const [loading, setLoading] = useState(false);
  const { isAdmin, loading: adminLoading } = useAdminStatus();

  useEffect(() => {
    // Check if policy already exists
    const checkPolicy = async (): Promise<void> => {
      try {
        const searchResult = await medplum.search('AccessPolicy', {
          name: MSO_ACCESS_POLICY.name,
        });

        if (searchResult.entry?.[0]?.resource) {
          setExistingPolicy(searchResult.entry[0].resource as AccessPolicy);
        }
      } catch (error) {
        console.error('Error checking policy:', normalizeErrorString(error));
      }
    };

    checkPolicy().catch(console.error);
  }, [medplum]);

  const handleUpload = async (): Promise<void> => {
    setLoading(true);
    try {
      if (existingPolicy) {
        // Update existing policy
        const updated = await medplum.updateResource<AccessPolicy>({
          ...MSO_ACCESS_POLICY,
          id: existingPolicy.id,
        });
        setExistingPolicy(updated);
        showNotification({
          title: 'Success',
          message: 'Access policy updated successfully',
          color: 'green',
        });
      } else {
        // Create new policy
        const created = await medplum.createResource<AccessPolicy>(MSO_ACCESS_POLICY);
        setExistingPolicy(created);
        showNotification({
          title: 'Success',
          message: 'Access policy created successfully',
          color: 'green',
        });
      }
    } catch (error) {
      console.error('Error uploading policy:', error);
      showNotification({
        title: 'Error',
        message: normalizeErrorString(error),
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
  };

  // If still checking admin status, show nothing yet
  if (adminLoading) {
    return (
      <Document>
        <Stack gap="lg">
          <Title>Upload Access Policy</Title>
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
          <Title>Upload Access Policy</Title>
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
        <Title>Upload Access Policy</Title>

        <Text>
          This page allows you to upload the Multi-Tenant Organization Access Policy required for the MSO demo. This
          policy defines the access rules for organizations and practitioners in the system.
        </Text>

        {existingPolicy && (
          <Text color="yellow">
            An existing policy with name "{MSO_ACCESS_POLICY.name}" was found. Uploading now will update the existing
            policy.
          </Text>
        )}

        <Button onClick={handleUpload} loading={loading}>
          {existingPolicy ? 'Update Policy' : 'Upload Policy'}
        </Button>

        <Box pos="relative">
          <Code block>{JSON.stringify(MSO_ACCESS_POLICY, null, 2)}</Code>
          <CopyButton value={JSON.stringify(MSO_ACCESS_POLICY, null, 2)} timeout={2000}>
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
      </Stack>
    </Document>
  );
}
