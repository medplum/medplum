import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fhirSearch, fhirCreate } from '@/lib/medplum-client';
import { toFHIRAppointment, fromFHIRAppointment } from '@hh/fhir';
import type { Appointment } from '@medplum/fhirtypes';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  const params: Record<string, string> = { _sort: 'date', _count: '200' };
  if (dateFrom) params['date'] = `ge${dateFrom}`;
  if (dateTo) params['date'] = params['date']
    ? `ge${dateFrom}&date=le${dateTo}`
    : `le${dateTo}`;

  const appointments = await fhirSearch<Appointment>('Appointment', params);
  return NextResponse.json(appointments.map(fromFHIRAppointment));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { patientId, patientName, start, end, notes, isHomeVisit, homeVisitAddress } = body;

  if (!patientId) return NextResponse.json({ error: 'Paciente é obrigatório' }, { status: 400 });
  if (!start) return NextResponse.json({ error: 'Data/hora é obrigatória' }, { status: 400 });
  if (!end) return NextResponse.json({ error: 'Duração é obrigatória' }, { status: 400 });

  const practitionerId = session.user.practitionerId;
  const practitionerName = session.user.name ?? '';

  const fhir = toFHIRAppointment({
    id: '',
    patientId,
    patientName: patientName ?? '',
    practitionerId,
    practitionerName,
    start,
    end,
    status: 'scheduled',
    notes,
    isHomeVisit,
    homeVisitAddress,
  });

  const created = await fhirCreate<Appointment>('Appointment', fhir);
  return NextResponse.json(fromFHIRAppointment(created), { status: 201 });
}
