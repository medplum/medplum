// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader, Paper, Tabs } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientHeader, useResource } from '@medplum/react';
import { Fragment, JSX } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';

export function PatientPage(): JSX.Element {
  const navigate = useNavigate();
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <Paper>
        <PatientHeader patient={patient} />
        <Tabs onChange={(t) => navigate(`./${t}`)?.catch(console.error)}>
          <Tabs.List>
            <Tabs.Tab value="overview">Overview</Tabs.Tab>
            <Tabs.Tab value="timeline">Timeline</Tabs.Tab>
            <Tabs.Tab value="history">History</Tabs.Tab>
          </Tabs.List>
        </Tabs>
      </Paper>
      <Outlet />
    </Fragment>
  );
}
