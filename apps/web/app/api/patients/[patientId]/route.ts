import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { fhirGet, fhirUpdate } from '@/lib/medplum-client';
import { toFHIRPatient, fromFHIRPatient } from '@hh/fhir';
import { isValidCPF } from '@hh/core';
import type { Patient } from '@medplum/fhirtypes';

export const PUT = withAuth(async (
  req: NextRequest,
  session,
  context
) => {
  const { patientId } = await context!.params;
  const body = await req.json();
  const { name, phone, cpf, email, birthDate, notes } = body;
  const projectId = session.user.projectId;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório' }, { status: 400 });
  if (cpf && !isValidCPF(cpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });

  const existing = await fhirGet<Patient>('Patient', patientId, projectId);
  const updated = { ...toFHIRPatient({ id: patientId, name, phone, cpf, email, birthDate, notes, createdAt: '' }), meta: existing.meta };
  const result = await fhirUpdate<Patient>('Patient', patientId, updated, projectId);
  return NextResponse.json(fromFHIRPatient(result));
});
