import { Flex, Loader } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { PatientSummary, useResource } from '@medplum/react';
import { Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { SoapNote } from '../components/soapnote/SoapNote';
import { TaskList } from '../components/tasks/TaskList';

export function PatientPage(): JSX.Element {
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <Flex gap="xs" justify="center" align="flex-start" direction="row">
        <PatientSummary patient={patient} />
        <TaskList />
        <SoapNote />
      </Flex>
    </Fragment>
  );
}
