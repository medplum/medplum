import { Paper, Tabs } from '@mantine/core';
import { getReferenceString, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Coverage, Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';

interface PatientDetailsProps {
  readonly patient: Patient;
}

export function PatientDetails({ patient }: PatientDetailsProps): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };

  const tabs = ['Details', 'Coverages', 'Edit', 'History'];

  // Get the tab from the URL. If none, default to Details
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  // Get all Coverage resources related to the Patient
  const coverageSearchQuery = `Coverage?patient=${getReferenceString(patient)}`;
  const coverageSearchRequest = parseSearchDefinition(coverageSearchQuery);

  const onPatientEditSubmit = (updatedPatient: Resource) => {
    console.log(updatedPatient);
  };

  const handleTabChange = (newTab: string | null): void => {
    navigate(`/Patient/${id}/${newTab ?? ''}`);
  };

  return (
    <Document m="sm">
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List style={{ whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
          {tabs.map((tab) => (
            <Tabs.Tab key={tab} value={tab.toLowerCase()}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable key={`Patient/${patient.id}`} value={patient} ignoreMissingValues={true} />
        </Tabs.Panel>
        <Tabs.Panel value="coverages">
          <SearchControl
            search={coverageSearchRequest}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={patient} onSubmit={onPatientEditSubmit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Patient" id={patient.id} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
