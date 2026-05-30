import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { fhirGet, fhirUpdate } from '@/lib/medplum-client';
import { fromFHIRAppointment } from '@hh/fhir';
import type { Appointment } from '@medplum/fhirtypes';

export const PATCH = withAuth(async (
  req: NextRequest,
  session,
  context,
) => {
  const { appointmentId } = await context!.params;
  const body = await req.json();
  const projectId = session.user.projectId;

  const existing = await fhirGet<Appointment>('Appointment', appointmentId, projectId);

  const updated: Appointment = {
    ...existing,
    ...(body.status && { status: body.status }),
    ...(body.start && { start: body.start }),
    ...(body.end && { end: body.end }),
    ...(body.notes !== undefined && { comment: body.notes }),
  };

  const result = await fhirUpdate<Appointment>('Appointment', appointmentId, updated, projectId);
  return NextResponse.json(fromFHIRAppointment(result));
});
