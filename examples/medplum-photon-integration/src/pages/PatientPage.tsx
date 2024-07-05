import { Loader } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import { Patient } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react';
import { Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { PatientDetails } from '../components/PatientDetails';
import { PatientHeader } from './PatientHeader';

export function PatientPage(): JSX.Element {
  const { id } = useParams();
  const patient = useResource<Patient>({ reference: `Patient/${id}` });
  if (!patient) {
    return <Loader />;
  }

  return (
    <Fragment key={getReferenceString(patient)}>
      <PatientHeader patient={patient} />
      <PatientDetails />
    </Fragment>
  );
}
