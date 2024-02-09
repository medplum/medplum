import { Loader, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { Fragment } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <PatientHeader patient={patient} />
      <Tabs onChange={(t) => navigate(`./${t}`)}>
        <Tabs.List bg="white">
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      <Outlet />
    </Fragment>
  );
}
