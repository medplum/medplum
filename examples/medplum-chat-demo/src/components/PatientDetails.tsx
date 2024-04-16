import { Loader, Tabs } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString, Operator, SearchRequest } from '@medplum/core';
import { Patient, Practitioner, Resource } from '@medplum/fhirtypes';
import {
  Document,
  ResourceForm,
  ResourceHistoryTable,
  ResourceTable,
  SearchControl,
  useMedplum,
  useMedplumProfile,
  useResource,
} from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate, useParams } from 'react-router-dom';
import { PatientHeader } from '../pages/PatientHeader';
import { cleanResource } from '../utils';

interface PatientDetailsProps {
  onChange: (patient: Patient) => void;
}

export function PatientDetails({ onChange }: PatientDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const profile = useMedplumProfile() as Practitioner;
  const { id } = useParams() as { id: string };
  const patient = useResource<Patient>({ reference: `Patient/${id}` });

  const tabs = ['Details', 'Threads', 'Edit', 'History'];
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t.toLowerCase()).includes(tab) ? tab : tabs[0].toLowerCase();

  // Create a search request to get all threads that the current patient is a participant in or a subject of.
  const threadSearch: SearchRequest = {
    resourceType: 'Communication',
    filters: [
      { code: 'part-of:missing', operator: Operator.EQUALS, value: 'true' },
      { code: 'subject', operator: Operator.EQUALS, value: `Patient/${id}` },
      { code: 'recipient', operator: Operator.EQUALS, value: getReferenceString(profile) },
    ],
    fields: ['topic', 'category', '_lastUpdated'],
  };

  async function handlePatientEdit(newPatient: Resource): Promise<void> {
    try {
      const updatedPatient = (await medplum.updateResource(cleanResource(newPatient))) as Patient;
      showNotification({
        icon: <IconCircleCheck />,
        title: 'Success',
        message: 'Patient updated',
      });
      onChange(updatedPatient);
      window.scrollTo(0, 0);
    } catch (err) {
      showNotification({
        icon: <IconCircleOff />,
        title: 'Error',
        message: normalizeErrorString(err),
      });
    }
  }

  function handleTabChange(newTab: string | null): void {
    navigate(`/Patient/${id}/${newTab ?? ''}`);
  }

  if (!patient) {
    return <Loader />;
  }

  return (
    <Document>
      <PatientHeader patient={patient} />
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List>
          {tabs.map((tab) => (
            <Tabs.Tab value={tab.toLowerCase()} key={tab}>
              {tab}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel value="details">
          <ResourceTable value={patient} />
        </Tabs.Panel>
        <Tabs.Panel value="threads">
          <SearchControl
            search={threadSearch}
            hideFilters={true}
            hideToolbar={true}
            onClick={(e) => navigate(`/${getReferenceString(e.resource)}`)}
          />
        </Tabs.Panel>
        <Tabs.Panel value="edit">
          <ResourceForm defaultValue={patient} onSubmit={handlePatientEdit} />
        </Tabs.Panel>
        <Tabs.Panel value="history">
          <ResourceHistoryTable resourceType="Patient" id={id} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
