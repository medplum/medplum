import { Document, ResourceForm, Tab, TabBar, TabPanel, TabSwitch } from 'medplum-ui';
import React from 'react';
import { useParams } from 'react-router-dom';
import { history } from './history';
import './ResourcePage.css';

export function ResourcePage() {
  const { resourceType, id, tab } = useParams() as any;
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
        <Tab name="raw" label="Raw" />
        <Tab name="history" label="History" />
        <Tab name="blame" label="Blame" />
        <Tab name="edit" label="Edit" />
      </TabBar>
      <Document>
        <TabSwitch value={tab || 'details'}>
          <TabPanel name="details">
            <ResourceForm resourceType={resourceType} id={id} />
          </TabPanel>
          <TabPanel name="raw">
            <div>Raw</div>
          </TabPanel>
          <TabPanel name="history">
            <div>History</div>
          </TabPanel>
          <TabPanel name="blame">
            <div>Blame</div>
          </TabPanel>
          <TabPanel name="edit">
            <div>Edit</div>
          </TabPanel>
        </TabSwitch>
      </Document>
    </>
  );
}
