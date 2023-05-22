import { usePatientInfo } from '../pages/PatientPage';
import { PatientTimeline } from '@medplum/react';
import React from 'react';

/*
 * The PatientTimeline component displays relevant events related to the patient
 */
export function Timeline(): JSX.Element {
  const { patient } = usePatientInfo().data;
  return <PatientTimeline patient={patient} />;
}
