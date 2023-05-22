import { usePatientInfo } from '../pages/PatientPage';
import { PatientTimeline } from '@medplum/react';
import React from 'react';
import { Document } from '@medplum/react';

/*
 * The PatientTimeline component displays relevant events related to the patient
 */
export function Timeline(): JSX.Element {
  const { patient } = usePatientInfo().data;
  return (
    <>
      <Document>
        <h3>Timeline</h3>
      </Document>
      <PatientTimeline patient={patient} />
    </>
  );
}
