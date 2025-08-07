// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString, parseSearchRequest } from '@medplum/core';
import { Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, SearchControl, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';
import { cleanResource } from './utils';

interface PatientDetailsProps {
  readonly patient: Patient;
  readonly onChange: (updatedPatient: Patient) => void;
}

export function PatientDetails({ patient, onChange }: PatientDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const { id } = useParams() as { id: string };

  const tabs = ['Details', 'Coverages', 'Edit', 'History'];

  // Get the tab from the URL. If none, default to Details
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  // Get all Coverage resources related to the Patient
  const coverageSearchQuery = `Coverage?patient=${getReferenceString(patient)}`;
  const coverageSearchRequest = parseSearchRequest(coverageSearchQuery);
  coverageSearchRequest.fields = ['payor', 'relationship', 'period'];

  const handlePatientEdit = async (newPatient: Resource): Promise<void> => {
    try {
      // Update the patient and navigate to its details page
      const updatedPatient = (await medplum.updateResource(cleanResource(newPatient))) as Patient;
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Patient updated',
      });
      onChange(updatedPatient);
      navigate(`/Patient/${id}`)?.catch(console.error);
      window.scrollTo(0, 0);
    } catch (error) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(error),
      });
    }
  };

  const handleTabChange = (newTab: string | null): void => {
    navigate(`/Patient/${id}/${newTab ?? ''}`)?.catch(console.error);
  };

  return (
    <Document m="0">
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
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)?.catch(console.error)}
            hideFilters={true}
            hideToolbar={true}
          />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={patient} onSubmit={handlePatientEdit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Patient" id={patient.id} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
