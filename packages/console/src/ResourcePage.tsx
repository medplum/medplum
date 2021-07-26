import { Bundle, getDisplayString, Resource } from '@medplum/core';
import { Button, Document, keyReplacer, Loading, parseForm, ResourceBlame, ResourceForm, ResourceHistoryTable, ResourceTable, Tab, TabBar, TabPanel, TabSwitch, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';

export function ResourcePage() {
  const { resourceType, id, tab } = useParams<{ resourceType: string, id: string, tab: string }>();
  const medplum = useMedplum();
  const [loading, setLoading] = useState<boolean>(true);
  const [value, setValue] = useState<Resource | undefined>();
  const [historyBundle, setHistoryBundle] = useState<Bundle | undefined>();
  const [error, setError] = useState();

  function loadResource() {
    setLoading(true);
    medplum.read(resourceType, id)
      .then(result => setValue(result))
      .then(() => medplum.readHistory(resourceType, id))
      .then(result => setHistoryBundle(result))
      .then(() => setLoading(false))
      .catch(reason => {
        console.log('reason', reason);
        setLoading(false);
        setError(reason);
      })
  }

  useEffect(() => {
    loadResource();
  }, [resourceType, id]);

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <Document>
        <pre>{JSON.stringify(error, undefined, 2)}</pre>
      </Document>
    );
  }

  return (
    <>
      <div style={{
        backgroundColor: 'white',
        borderBottom: '2px solid #eee',
        color: '#444',
        fontWeight: 'bold',
        padding: '15px 30px',
      }}>
        {value ? getDisplayString(value) : `${resourceType} ${id}`}
      </div>
      <TabBar
        value={tab || 'details'}
        onChange={(name: string) => history.push(`/${resourceType}/${id}/${name}`)}>
        <Tab name="details" label="Details" />
        <Tab name="edit" label="Edit" />
        <Tab name="history" label="History" />
        <Tab name="blame" label="Blame" />
        <Tab name="json" label="JSON" />
      </TabBar>
      <Document>
        <TabSwitch value={tab || 'details'}>
          <TabPanel name="details">
            <ResourceTable resource={value} />
          </TabPanel>
          <TabPanel name="edit">
            <ResourceForm
              resource={value}
              onSubmit={(resource: Resource) => {
                medplum.update(resource).then(() => loadResource());
              }}
            />
          </TabPanel>
          <TabPanel name="history">
            <ResourceHistoryTable history={historyBundle} />
          </TabPanel>
          <TabPanel name="blame">
            <ResourceBlame history={historyBundle} />
          </TabPanel>
          <TabPanel name="json">
            <form onSubmit={e => {
              e.preventDefault();
              const formData = parseForm(e.target as HTMLFormElement);
              const resource = JSON.parse(formData.resource);
              medplum.update(resource).then(() => loadResource());
            }}>
              <textarea id="resource" name="resource" defaultValue={JSON.stringify(value, keyReplacer, 2)} />
              <Button type="submit">OK</Button>
            </form>
          </TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}
