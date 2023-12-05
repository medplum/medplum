import { PatientTimeline } from '@medplum/react';
import { useParams } from 'react-router-dom';

/*
 * The PatientTimeline component displays relevant events related to the patient
 */
export function Timeline(): JSX.Element {
  const { id } = useParams();
  return <PatientTimeline patient={{ reference: `Patient/${id}` }} />;
}
