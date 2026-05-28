import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date');

  // TODO: verify session + resolve projectId
  // TODO: query Medplum FHIR server for Appointment resources
  // TODO: map via fromFHIRAppointment

  return NextResponse.json({ appointments: [], date });
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  // TODO: verify session
  // TODO: validate body (required: patientId, practitionerId, start, end)
  // TODO: check for scheduling conflicts
  // TODO: create Appointment in Medplum via toFHIRAppointment
  // TODO: trigger WhatsApp confirmation if phone present

  return NextResponse.json({ id: 'pending' }, { status: 201 });
}
