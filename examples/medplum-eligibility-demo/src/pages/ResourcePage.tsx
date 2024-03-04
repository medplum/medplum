import { Flex, Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getDisplayString, getReferenceString, normalizeErrorString } from '@medplum/core';
import { CoverageEligibilityRequest, Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { UpdateCoverageEligibilityStatus } from '../components/actions/UpdateCoverageEligibilityStatus';
import { cleanResource } from '../components/utils';

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

  // Get the tab from the URL. If none, default to Details
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  useEffect(() => {
    const fetchResource = async (): Promise<void> => {
      if (resourceType && id) {
        try {
          const resourceData = await medplum.readResource(resourceType as ResourceType, id);
          setResource(resourceData);
        } catch (error) {
          console.error(error);
        }
      }
    };

    fetchResource().catch((error) => console.error(error));
  }, [medplum, resourceType, id]);

  const handleUpdateStatus = (updatedCoverageEligibility: Resource): void => {
    setResource(updatedCoverageEligibility);
  };

  const handleTabChange = (newTab: string | null): void => {
    navigate(`/${resourceType}/${id}/${newTab ?? ''}`);
  };

  const handleEditSubmit = async (newResource: Resource): Promise<void> => {
    try {
      // Update the resource
      const updatedResource = await medplum.updateResource(cleanResource(newResource));
      // Set the resource to re-render the page
      setResource(updatedResource);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: `${resourceType} updated`,
      });
      // Navigate back to the top of the details page
      navigate(`/${resourceType}/${id}`);
      window.scrollTo(0, 0);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  };

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Flex gap="md" justify="space-between">
        <Title>{getDisplayString(resource)}</Title>
        {resourceType === 'CoverageEligibilityRequest' ? (
          <UpdateCoverageEligibilityStatus
            coverageEligibility={resource as CoverageEligibilityRequest}
            onChange={handleUpdateStatus}
          />
        ) : null}
      </Flex>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`${resourceType}/${id}`} value={resource} />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={resource} onSubmit={handleEditSubmit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType={resourceType} id={id} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
