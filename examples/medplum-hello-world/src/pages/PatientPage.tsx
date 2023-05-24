import { Loader, Tabs } from '@mantine/core';
import { capitalize, getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import React from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { PatientHeader } from './PatientHeader';

export function PatientPage(): JSX.Element {
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <React.Fragment key={getReferenceString(patient)}>
      <PatientHeader patient={patient} />
      <Tabs>
        <Tabs.List bg="white">
          <TabLink value="overview" />
          <TabLink value="timeline" />
          <TabLink value="history" />
        </Tabs.List>
      </Tabs>
      <Outlet />
    </React.Fragment>
  );
}

function TabLink(props: { value: string }): JSX.Element {
  return (
    <Link to={props.value} style={{ textDecoration: 'none' }}>
      <Tabs.Tab value={props.value}>{capitalize(props.value)}</Tabs.Tab>
    </Link>
  );
}
