import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fhirSearch, fhirCreate } from '@/lib/medplum-client';
import { toFHIRPatient, fromFHIRPatient } from '@hh/fhir';
import { isValidCPF } from '@hh/core';
import type { Patient } from '@medplum/fhirtypes';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const q = req.nextUrl.searchParams.get('q') ?? '';

  const params: Record<string, string> = { _sort: '-_lastUpdated', _count: '50' };
  if (q) params.name = q;

  const patients = await fhirSearch<Patient>('Patient', params);
  return NextResponse.json(patients.map(fromFHIRPatient));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, phone, cpf, email, birthDate, notes } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  if (!phone?.trim()) return NextResponse.json({ error: 'Telefone é obrigatório' }, { status: 400 });
  if (cpf && !isValidCPF(cpf)) return NextResponse.json({ error: 'CPF inválido' }, { status: 400 });

  const fhirPatient = toFHIRPatient({ id: '', name, phone, cpf, email, birthDate, notes, createdAt: '' });
  const created = await fhirCreate<Patient>('Patient', fhirPatient);
  return NextResponse.json(fromFHIRPatient(created), { status: 201 });
}
