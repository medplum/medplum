// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Divider, Modal, ScrollArea, Stack, Table, Text, Title } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications, showNotification } from '@mantine/notifications';
import { getResourceTypes, normalizeErrorString } from '@medplum/core';
import type { Bundle, BundleEntry, ResourceType } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, useMedplum } from '@medplum/react';
import { IconCheck, IconX } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useState } from 'react';
import { getProjectId } from '../utils';

interface ResourceCount {
  resourceType: string;
  count: number;
}

export function ProjectDetailsPage(): JSX.Element {
  const medplum = useMedplum();
  const projectId = getProjectId(medplum);
  const result = medplum.get(`admin/projects/${projectId}`).read();
  const [modalOpened, { open: openModal, close: closeModal }] = useDisclosure(false);
  const [resourceCounts, setResourceCounts] = useState<ResourceCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  async function calculateResourceCounts(): Promise<void> {
    const notificationId = Date.now().toString();
    setIsLoading(true);

    showNotification({
      id: notificationId,
      loading: true,
      title: 'Calculating Resource Counts',
      message: 'Fetching counts for all resource types...',
      autoClose: false,
      withCloseButton: false,
    });

    try {
      const resourceTypes = getResourceTypes();

      // Build a batch bundle with count queries for each resource type
      const request: Bundle = {
        resourceType: 'Bundle',
        type: 'batch',
        entry: resourceTypes.map((resourceType: ResourceType) => ({
          request: {
            method: 'GET',
            url: `${resourceType}?_summary=count`,
          },
        })),
      };

      // Execute the batch request
      const response = await medplum.executeBatch(request);

      // Extract counts from the response
      const counts: ResourceCount[] = (response.entry as BundleEntry[])
        .map((entry: BundleEntry, index: number) => {
          const bundle = entry.resource as Bundle | undefined;
          const count = bundle?.total ?? 0;
          return {
            resourceType: resourceTypes[index],
            count,
          };
        })
        .filter((item) => item.count > 0) // Only show resource types with counts > 0
        .sort((a, b) => b.count - a.count); // Sort by count descending

      const total = counts.reduce((sum, item) => sum + item.count, 0);

      setResourceCounts(counts);
      setTotalCount(total);
      openModal();

      notifications.update({
        id: notificationId,
        color: 'green',
        title: 'Resource Counts Calculated',
        message: `Found ${total.toLocaleString()} total resources across ${counts.length} resource types`,
        icon: <IconCheck size="1rem" />,
        loading: false,
        autoClose: true,
        withCloseButton: true,
      });
    } catch (err) {
      notifications.update({
        id: notificationId,
        color: 'red',
        title: 'Failed to Calculate Resource Counts',
        message: normalizeErrorString(err),
        icon: <IconX size="1rem" />,
        loading: false,
        autoClose: false,
        withCloseButton: true,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Title>Details</Title>
      <DescriptionList>
        <DescriptionListEntry term="ID">{result.project.id}</DescriptionListEntry>
        <DescriptionListEntry term="Name">{result.project.name}</DescriptionListEntry>
      </DescriptionList>
      <Divider my="lg" />
      <Title order={2}>Resource Counts</Title>
      <Text mb="md">
        Calculate and display the total count of resources by type in this project. This may take a moment for projects
        with many resources.
      </Text>
      <Button onClick={calculateResourceCounts} loading={isLoading}>
        Calculate Resource Counts
      </Button>

      <Modal opened={modalOpened} onClose={closeModal} title="Resource Counts" size="xl" centered>
        <Stack>
          {totalCount !== undefined && (
            <Text size="lg" fw={500}>
              Total Resources: {totalCount.toLocaleString()}
            </Text>
          )}
          <ScrollArea h={500}>
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Resource Type</Table.Th>
                  <Table.Th style={{ textAlign: 'right' }}>Count</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {resourceCounts.map((item) => (
                  <Table.Tr key={item.resourceType}>
                    <Table.Td>{item.resourceType}</Table.Td>
                    <Table.Td style={{ textAlign: 'right' }}>{item.count.toLocaleString()}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </Stack>
      </Modal>
    </>
  );
}
