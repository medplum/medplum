import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fhirGet, fhirUpdate } from '@/lib/medplum-client';
import { fromFHIRAppointment } from '@hh/fhir';
import type { Appointment } from '@medplum/fhirtypes';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ appointmentId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { appointmentId } = await params;
  const body = await req.json();

  const existing = await fhirGet<Appointment>('Appointment', appointmentId);

  const updated: Appointment = {
    ...existing,
    ...(body.status && { status: body.status }),
    ...(body.start && { start: body.start }),
    ...(body.end && { end: body.end }),
    ...(body.notes !== undefined && { comment: body.notes }),
  };

  const result = await fhirUpdate<Appointment>('Appointment', appointmentId, updated);
  return NextResponse.json(fromFHIRAppointment(result));
}
