import { Resource } from 'medplum';
import { Document, ResourceForm, ResourceTable, Tab, TabBar, TabPanel, TabSwitch, useMedplum } from 'medplum-ui';
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import './ResourcePage.css';

export function ResourcePage() {
  const { resourceType, id, tab } = useParams() as any;
  const medplum = useMedplum();
  const [value, setValue] = useState<Resource | undefined>();

  useEffect(() => {
    medplum.read(resourceType, id)
      .then(result => setValue(result));
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
          </TabPanel>
          <TabPanel name="blame">
            <div>Blame</div>
          </TabPanel>
          <TabPanel name="json">
            <pre></pre>
            <form onSubmit={e => {
              e.preventDefault();
            }}>
              <textarea>{JSON.stringify(value, undefined, 2)}</textarea>
            </form>
          </TabPanel>
          <TabPanel name="jsonedit">
            <div>JSON Edit</div>
          </TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}
