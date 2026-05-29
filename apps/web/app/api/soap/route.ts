import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { fhirSearch, fhirCreate } from '@/lib/medplum-client';
import { toFHIRClinicalImpression, fromFHIRClinicalImpression } from '@hh/fhir';
import type { ClinicalImpression } from '@medplum/fhirtypes';

export const GET = withAuth(async (req: NextRequest, session) => {
  const patientId = req.nextUrl.searchParams.get('patientId');
  if (!patientId) return NextResponse.json({ error: 'patientId é obrigatório' }, { status: 400 });

  const notes = await fhirSearch<ClinicalImpression>(
    'ClinicalImpression',
    { subject: `Patient/${patientId}`, _sort: '-date', _count: '50' },
    session.user.projectId,
  );

  return NextResponse.json(notes.map(fromFHIRClinicalImpression));
});

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const { patientId, appointmentId, date, subjective, objective, assessment, plan } = body;

  if (!patientId) return NextResponse.json({ error: 'Paciente é obrigatório' }, { status: 400 });
  if (!subjective && !objective && !assessment && !plan) {
    return NextResponse.json({ error: 'Preencha pelo menos um campo SOAP' }, { status: 400 });
  }

  const fhir = toFHIRClinicalImpression({
    patientId,
    practitionerId: session.user.practitionerId,
    appointmentId,
    date: date ?? new Date().toISOString(),
    subjective: subjective ?? '',
    objective: objective ?? '',
    assessment: assessment ?? '',
    plan: plan ?? '',
  });

  const created = await fhirCreate<ClinicalImpression>(
    'ClinicalImpression',
    fhir,
    session.user.projectId,
  );

  return NextResponse.json(fromFHIRClinicalImpression(created), { status: 201 });
});
