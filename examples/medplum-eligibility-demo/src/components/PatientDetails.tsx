import { Paper, Tabs } from '@mantine/core';
import { getReferenceString, parseSearchDefinition, SearchRequest } from '@medplum/core';
import { Coverage, Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, SearchControl, useMedplum } from '@medplum/react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface PatientDetailsProps {
  readonly patient: Patient;
}

export function PatientDetails({ patient }: PatientDetailsProps): JSX.Element {
  const navigate = useNavigate();

  const tabs = ['Details', 'Coverages', 'Edit', 'History'];
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  const coverageSearchQuery = `Coverage?patient=${getReferenceString(patient)}`;
  const coverageSearchRequest = parseSearchDefinition(coverageSearchQuery);

  const onPatientEditSubmit = (updatedPatient: Resource) => {
    console.log(updatedPatient);
  };

  return (
    <Document m="sm">
      <Tabs defaultValue="details">
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
