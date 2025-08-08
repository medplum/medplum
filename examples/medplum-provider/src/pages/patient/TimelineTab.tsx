// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Loader } from '@mantine/core';
import { PatientTimeline } from '@medplum/react';
import { JSX } from 'react';
import { usePatient } from '../../hooks/usePatient';

export function TimelineTab(): JSX.Element {
  const patient = usePatient();
  if (!patient) {
    return <Loader />;
  }
  return <PatientTimeline patient={patient} />;
}
