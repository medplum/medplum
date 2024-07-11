import { Tabs } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Patient, Resource } from '@medplum/fhirtypes';
import { Document, ResourceForm, ResourceHistoryTable, ResourceTable, useMedplum } from '@medplum/react';
import { IconCircleCheck, IconCircleOff } from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { PatientConsents } from './PatientConsents';
import { PatientObservations } from './PatientObservations';

interface PatientDetailsProps {
  patient: Patient;
  onChange: (patient: Patient) => void;
}

export function PatientDetails(props: PatientDetailsProps): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const id = props.patient.id;

  const tabs = [
    ['details', 'Details'],
    ['edit', 'Edit'],
    ['history', 'History'],
    ['observations', 'SDOH'],
    ['consents', 'Consents'],
  ];
  // Get the current tab
  const tab = window.location.pathname.split('/').pop();
  const currentTab = tab && tabs.map((t) => t[0]).includes(tab) ? tab : tabs[0][0];

  function handleTabChange(newTab: string | null): void {
    navigate(`/Patient/${id}/${newTab ?? ''}`);
  }

  function handlePatientEdit(resource: Resource): void {
    medplum
      // Update the resource then re-render the page and go to the details tab
      .updateResource(resource)
      .then((patient) => {
        props.onChange(patient as Patient);
        showNotification({
          icon: <IconCircleCheck />,
          title: 'Success',
          message: 'Patient edited',
        });
        navigate(`/Patient/${id}/details`);
        window.scrollTo(0, 0);
      })
      .catch((err) => {
        showNotification({
          color: 'red',
          icon: <IconCircleOff />,
          title: 'Error',
          message: normalizeErrorString(err),
        });
      });
  }

  return (
    <Document>
      <Tabs value={currentTab.toLowerCase()} onChange={handleTabChange}>
        <Tabs.List mb="xs">
          {tabs.map((tab) => (
            <Tabs.Tab value={tab[0]} key={tab[0]}>
              {tab[1]}
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
        <Tabs.Panel value="observations">
          <PatientObservations patient={props.patient} />
        </Tabs.Panel>
        <Tabs.Panel value="consents">
          <PatientConsents patient={props.patient} />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}
