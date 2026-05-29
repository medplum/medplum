import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/with-auth';
import { fhirSearch, fhirCreate } from '@/lib/medplum-client';
import { toFHIRPatient, fromFHIRPatient } from '@hh/fhir';
import { isValidCPF } from '@hh/core';
import type { Patient } from '@medplum/fhirtypes';

export const GET = withAuth(async (req: NextRequest, session) => {
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const params: Record<string, string | string[]> = { _sort: '-_lastUpdated', _count: '50' };
  if (q) params.name = q;

  const patients = await fhirSearch<Patient>('Patient', params, session.user.projectId);
  return NextResponse.json(patients.map(fromFHIRPatient));
});

export const POST = withAuth(async (req: NextRequest, session) => {
  const body = await req.json();
  const { name, phone, cpf, email, birthDate, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório' }, { status: 400 });
  if (cpf && !isValidCPF(cpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });

  const fhirPatient = toFHIRPatient({ id: '', name, phone, cpf, email, birthDate, notes, createdAt: '' });
  const created = await fhirCreate<Patient>('Patient', fhirPatient, session.user.projectId);
  return NextResponse.json(fromFHIRPatient(created), { status: 201 });
});
