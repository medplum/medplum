import { Meta } from '@storybook/react';
import React from 'react';
import { PatientTimeline } from '../PatientTimeline';

export default {
  title: 'Medplum/PatientTimeline',
  component: PatientTimeline,
} as Meta;

export const Patient = (): JSX.Element => (
  <PatientTimeline patient={{ reference: 'Patient/' + process.env.SAMPLE_PATIENT_ID }} />
);
