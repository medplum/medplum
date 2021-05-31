import { Bundle, Resource } from '@medplum/core';
import { Button, Document, keyReplacer, parseForm, ResourceForm, ResourceTable, Tab, TabBar, TabPanel, TabSwitch, useMedplum } from '@medplum/ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import './ResourcePage.css';

export function ResourcePage() {
  const { resourceType, id, tab } = useParams() as any;
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
    return <div>Loading...</div>;
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
        {resourceType} {id}
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
                console.log('submit', resource);
                medplum.update(resource).then(() => loadResource());
              }}
            />
          </TabPanel>
          <TabPanel name="history">
            <table style={{ width: '100%', lineHeight: '32px' }}>
              <thead>
                <tr>
                  <th>Version ID</th>
                  <th>Date/Time</th>
                </tr>
              </thead>
              <tbody>
                {historyBundle && historyBundle.entry?.map(entry => (
                  <tr key={entry.resource?.meta?.versionId}>
                    <td>{entry.resource?.meta?.versionId}</td>
                    <td>{entry.resource?.meta?.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TabPanel>
          <TabPanel name="blame">
            <div>Blame</div>
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
