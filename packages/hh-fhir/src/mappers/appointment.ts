import type { Appointment } from '@medplum/fhirtypes';
import type { HHAppointment, AppointmentStatus } from '@hh/core';
import { HH_EXT, getExtension } from '../extensions';

const FHIR_STATUS_MAP: Record<string, AppointmentStatus> = {
  booked: 'scheduled',
  arrived: 'confirmed',
  fulfilled: 'completed',
  cancelled: 'cancelled',
  noshow: 'no-show',
};

const HH_TO_FHIR_STATUS: Record<AppointmentStatus, Appointment['status']> = {
  scheduled: 'booked',
  confirmed: 'arrived',
  completed: 'fulfilled',
  cancelled: 'cancelled',
  'no-show': 'noshow',
};

export function toFHIRAppointment(appt: HHAppointment): Appointment {
  const ext: Appointment['extension'] = [];
  if (appt.isHomeVisit) ext.push({ url: HH_EXT.HOME_VISIT, valueString: 'true' });
  if (appt.homeVisitAddress) ext.push({ url: HH_EXT.HOME_VISIT_ADDRESS, valueString: appt.homeVisitAddress });

  return {
    resourceType: 'Appointment',
    ...(appt.id && { id: appt.id }),
    status: HH_TO_FHIR_STATUS[appt.status],
    start: appt.start,
    end: appt.end,
    comment: appt.notes,
    participant: [
      {
        actor: { reference: `Patient/${appt.patientId}`, display: appt.patientName },
        status: 'accepted',
      },
      {
        actor: { reference: `Practitioner/${appt.practitionerId}`, display: appt.practitionerName },
        status: 'accepted',
      },
    ],
    ...(ext.length && { extension: ext }),
  };
}

export function fromFHIRAppointment(fhir: Appointment): HHAppointment {
  const patient = fhir.participant?.find((p) => p.actor?.reference?.startsWith('Patient/'));
  const practitioner = fhir.participant?.find((p) => p.actor?.reference?.startsWith('Practitioner/'));

  return {
    id: fhir.id ?? '',
    patientId: patient?.actor?.reference?.split('/')[1] ?? '',
    patientName: patient?.actor?.display ?? '',
    practitionerId: practitioner?.actor?.reference?.split('/')[1] ?? '',
    practitionerName: practitioner?.actor?.display ?? '',
    start: fhir.start ?? '',
    end: fhir.end ?? '',
    status: FHIR_STATUS_MAP[fhir.status] ?? 'scheduled',
    notes: fhir.comment,
    isHomeVisit: getExtension(fhir as any, 'HOME_VISIT') === 'true',
    homeVisitAddress: getExtension(fhir as any, 'HOME_VISIT_ADDRESS'),
  };
}
