// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDisplayString, isOk, normalizeErrorString } from '@medplum/core';
import type { Appointment, OperationOutcome } from '@medplum/fhirtypes';
import { useResource } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useState } from 'react';
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
  const [outcome, setOutcome] = useState<OperationOutcome>();
  const patient = useResource(actor, setOutcome);
  if (!actor?.reference) {
    return <>No Patient</>;
  }
  if (patient) {
    return <>{getDisplayString(patient)}</>;
  }
  // The reference's display is a copy from when it was written, so it only stands in until the
  // patient is read.
  if (actor.display) {
    return <>{actor.display}</>;
  }
  if (outcome && !isOk(outcome)) {
    return <>[{normalizeErrorString(outcome)}]</>;
  }
  return <>Loading…</>;
}
