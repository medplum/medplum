import { Resource } from 'medplum';
import { Button, Document, parseForm, ResourceForm, ResourceTable, Tab, TabBar, TabPanel, TabSwitch, useMedplum } from 'medplum-ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import './ResourcePage.css';

export function ResourcePage() {
  const { resourceType, id, tab } = useParams() as any;
  const medplum = useMedplum();
  const [value, setValue] = useState<Resource | undefined>();
  const [historyBundle, setHistoryBundle] = useState<Resource | undefined>();

  function loadResource() {
    medplum.read(resourceType, id).then(result => setValue(result));
    medplum.readHistory(resourceType, id).then(result => setHistoryBundle(result));
  }

  useEffect(() => {
    loadResource();
  }, [resourceType, id]);

  if (!value) {
    return <div>Loading...</div>
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
            <ResourceForm resource={value} />
          </TabPanel>
          <TabPanel name="history">
            <div>History</div>
            <pre>{JSON.stringify(historyBundle, undefined, 2)}</pre>
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
              <textarea id="resource" name="resource" defaultValue={JSON.stringify(value, undefined, 2)} />
              <Button type="submit">OK</Button>
            </form>
          </TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}
