import { Stack, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Resource, ResourceType } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import classes from './ResourcePage.module.css';
import { useResourceType } from './useResourceType';

const tabs = [
  { id: 'details', url: '', label: 'Details' },
  { id: 'edit', url: 'edit', label: 'Edit' },
  { id: 'history', url: 'history', label: 'History' },
];

export function ResourcePage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);
  const [currentTab, setCurrentTab] = useState<string>(() => {
    const tabId = window.location.pathname.split('/').pop();
    const tab = tabId ? tabs.find((t) => t.id === tabId) : undefined;
    return (tab ?? tabs[0]).id;
  });

  useResourceType(resourceType, { onInvalidResourceType: () => navigate('..') });

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id, navigate]);

  const onTabChange = useCallback(
    (newTabName: string | null): void => {
      if (!newTabName) {
        newTabName = tabs[0].id;
      }

      const tab = tabs.find((t) => t.id === newTabName);
      if (tab) {
        setCurrentTab(tab.id);
        navigate(tab.url);
      }
    },
    [navigate]
  );

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Stack>
        <Tabs variant="pills" value={currentTab.toLowerCase()} onChange={onTabChange} classNames={classes}>
          <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            {tabs.map((t) => (
              <Tabs.Tab key={t.id} value={t.id} px="sm">
                {t.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
        <Outlet />
      </Stack>
    </Document>
  );
}
