// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { PatientTimeline } from '@medplum/react';
import { JSX } from 'react';
import { useParams } from 'react-router';

/*
 * The PatientTimeline component displays relevant events related to the patient
 */
export function Timeline(): JSX.Element {
  const { id } = useParams();
  return <PatientTimeline patient={{ reference: `Patient/${id}` }} />;
}
