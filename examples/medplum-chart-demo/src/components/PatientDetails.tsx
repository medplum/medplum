import { Tabs, TabsPanel } from '@mantine/core';
import { Operator, parseSearchRequest, SearchRequest } from '@medplum/core';
import { Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, SearchControl } from '@medplum/react';
import { useNavigate } from 'react-router-dom';

interface PatientDetailsProps {
  patient: Patient;
}

export function PatientDetails(props: PatientDetailsProps): JSX.Element {
  const navigate = useNavigate();
  const id = props.patient.id;

  const tabs = ['Details', 'Edit', 'History', 'Clinicalimpressions', 'Observations'];
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  function handleTabChange(newTab: string | null) {
    navigate(`/Patient/${id}/${newTab ?? ''}`);
  }

  function handlePatientEdit(resource: Resource) {
    console.log(resource);
  }

  const clinicalImpressionSearch: SearchRequest = {
    resourceType: 'ClinicalImpression',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${id}` }],
    fields: ['status', 'description', 'problem'],
  };

  const observationSearch: SearchRequest = {
    resourceType: 'Observation',
    filters: [{ code: 'patient', operator: Operator.EQUALS, value: `Patient/${id}` }],
    fields: ['status', 'code', 'focus'],
  };

  return (
    <Document>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab.toLowerCase()} key={tab}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable value={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={props.patient} onSubmit={handlePatientEdit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Patient" id={id} />
        </Tabs.Panel>
        <Tabs.Panel value="clinicalimpressions">
          <SearchControl search={clinicalImpressionSearch} hideFilters={true} hideToolbar={true} />
        </Tabs.Panel>
        <Tabs.Panel value="observations">
          <SearchControl search={observationSearch} hideFilters={true} hideToolbar={true} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
