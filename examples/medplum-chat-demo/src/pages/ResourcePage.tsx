import { Grid, Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getDisplayString, normalizeErrorString } from '@medplum/core';
import { Patient, Reference, Resource, ResourceType } from '@medplum/fhirtypes';
import {
  Document,
  PatientSummary,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  useMedplum,
} from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cleanResource, shouldShowPatientSummary } from '../utils';

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

  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0];

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id]);

  async function handleResourceEdit(newResource: Resource): Promise<void> {
    try {
      const updatedResource = await medplum.updateResource(cleanResource(newResource));
      setResource(updatedResource);
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: `${resourceType} edited`,
      });
    } catch (err) {
      showNotification({
        color: 'red',
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  function handleTabChange(newTab: string | null): void {
    navigate(`/${resourceType}/${id}/${newTab ?? ''}`);
  }

  if (!resource) {
    return null;
  }

  return (
    <div>
      <Grid>
        {resource.resourceType === 'Encounter' && shouldShowPatientSummary(resource) ? (
          <Grid.Col span={4}>
            <PatientSummary patient={resource.subject as Reference<Patient>} m="sm" />
          </Grid.Col>
        ) : null}
        <Grid.Col span={resource.resourceType === 'Encounter' && shouldShowPatientSummary(resource) ? 8 : 12}>
          <Document m="sm">
            <Title>{getDisplayString(resource)}</Title>
            <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
              <Tabs.List>
                {tabs.map((tab) => (
                  <Tabs.Tab key={tab} value={tab.toLowerCase()}>
                    {tab}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              <Tabs.Panel value="details">
                <ResourceTable value={resource} />
              </Tabs.Panel>
              <Tabs.Panel value="edit">
                <ResourceForm defaultValue={resource} onSubmit={handleResourceEdit} />
              </Tabs.Panel>
              <Tabs.Panel value="history">
                <ResourceHistoryTable resourceType={resourceType} id={id} />
              </Tabs.Panel>
            </Tabs>
          </Document>
        </Grid.Col>
      </Grid>
    </div>
  );
}
