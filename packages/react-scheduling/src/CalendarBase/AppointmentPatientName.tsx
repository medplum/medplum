// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDisplayString } from '@medplum/core';
import type { Appointment } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { getPatientParticipant } from '../actors';

export interface AppointmentPatientNameProps {
  readonly appointment: Appointment;
}

/**
 * The appointment's patient, named as their own record names them.
 * @param props - The React props.
 * @returns The patient's name, or "No Patient" when the appointment has none.
 */
export function AppointmentPatientName(props: AppointmentPatientNameProps): JSX.Element {
  const actor = getPatientParticipant(props.appointment)?.actor;
  const patient = useResource(actor);
  if (!actor?.reference) {
    return <>No Patient</>;
  }
  // The reference's display is a copy from when it was written, so it only stands in until the
  // patient is read.
  return <>{patient ? getDisplayString(patient) : actor.display}</>;
}
