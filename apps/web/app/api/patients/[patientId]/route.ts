import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fhirGet, fhirUpdate } from '@/lib/medplum-client';
import { toFHIRPatient, fromFHIRPatient } from '@hh/fhir';
import { isValidCPF } from '@hh/core';
import type { Patient } from '@medplum/fhirtypes';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ patientId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { patientId } = await params;
  const body = await req.json();
  const { name, phone, cpf, email, birthDate, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório' }, { status: 400 });
  if (cpf && !isValidCPF(cpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });

  // Fetch existing to preserve meta/id
  const existing = await fhirGet<Patient>('Patient', patientId);
  const updated = { ...toFHIRPatient({ id: patientId, name, phone, cpf, email, birthDate, notes, createdAt: '' }), meta: existing.meta };
  const result = await fhirUpdate<Patient>('Patient', patientId, updated);
  return NextResponse.json(fromFHIRPatient(result));
}
