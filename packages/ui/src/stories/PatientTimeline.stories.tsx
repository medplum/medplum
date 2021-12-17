import { Meta } from '@storybook/react';
import React from 'react';
import { PatientTimeline } from '../PatientTimeline';

export default {
  title: 'Medplum/PatientTimeline',
  component: PatientTimeline,
} as Meta;

export const Patient = () => <PatientTimeline patient={{ reference: 'Patient/' + process.env.SAMPLE_PATIENT_ID }} />;
