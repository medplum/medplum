import { notFound } from 'next/navigation';
import { fhirGet } from '@/lib/medplum-client';
import { fromFHIRPatient } from '@hh/fhir';
import type { Patient } from '@medplum/fhirtypes';
import { PatientDetailClient } from './PatientDetailClient';

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;

  let patient;
  try {
    const fhir = await fhirGet<Patient>('Patient', patientId);
    patient = fromFHIRPatient(fhir);
  } catch {
    notFound();
  }

  return <PatientDetailClient patient={patient} />;
}
