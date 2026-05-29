import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { fhirSearch, fhirCreate } from '@/lib/medplum-client';
import { toFHIRAppointment, fromFHIRAppointment } from '@hh/fhir';
import type { Appointment } from '@medplum/fhirtypes';

export const GET = withAuth(async (req: NextRequest, session) => {
  const { searchParams } = req.nextUrl;
  const dateFrom = searchParams.get('from');
  const dateTo = searchParams.get('to');

  const dateFilter: string[] = [];
  if (dateFrom) dateFilter.push(`ge${dateFrom}`);
  if (dateTo) dateFilter.push(`le${dateTo}`);

  const params: Record<string, string | string[]> = { _sort: 'date', _count: '200' };
  if (dateFilter.length) params['date'] = dateFilter;

  const appointments = await fhirSearch<Appointment>('Appointment', params, session.user.projectId);
  return NextResponse.json(appointments.map(fromFHIRAppointment));
});

export const POST = withAuth(async (req: NextRequest, session) => {
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

  const created = await fhirCreate<Appointment>('Appointment', fhir, session.user.projectId);
  return NextResponse.json(fromFHIRAppointment(created), { status: 201 });
});
