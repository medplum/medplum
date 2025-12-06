// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, LinkTabs, ResourceForm, ResourceHistoryTable, ResourceTable, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

/**
 * This is an example of a generic "Resource Display" page.
 * It uses the Medplum `<ResourceTable>` component to display a resource.
 * @returns A React component that displays a resource.
 */
export function ResourcePage(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);
  const tabs = ['Details', 'Edit', 'History'];

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id]);

  function handleResourceEdit(resource: Resource): void {
    medplum
      // Update the resource the re-render and go to the details tab
      .updateResource(resource)
      .then((resource) => {
        setResource(resource);
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Resource edited.',
        });
        navigate(`/${resourceType}/${id}/details`)?.catch(console.error);
        window.scroll(0, 0);
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Title>{getDisplayString(resource)}</Title>
      <LinkTabs baseUrl={`/${resourceType}/${id}`} tabs={tabs}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab.toLowerCase()} key={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`${resourceType}/${id}`} value={resource} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={resource} onSubmit={handleResourceEdit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType={resourceType} id={id} />
        </Tabs.Panel>
      </LinkTabs>
    </Document>
  );
}
