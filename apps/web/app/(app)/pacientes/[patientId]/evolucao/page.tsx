import { notFound } from 'next/navigation';
import { fhirGet } from '@/lib/medplum-client';
import { fromFHIRPatient } from '@hh/fhir';
import type { Patient } from '@medplum/fhirtypes';
import { EvolucaoClient } from './EvolucaoClient';

export default async function EvolucaoPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;

  let patientName: string;
  try {
    const fhir = await fhirGet<Patient>('Patient', patientId);
    patientName = fromFHIRPatient(fhir).name;
  } catch {
    notFound();
  }

  return <EvolucaoClient patientId={patientId} patientName={patientName} />;
}
