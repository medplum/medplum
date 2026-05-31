import { notFound } from 'next/navigation';
import { auth } from '@/auth';
import { fhirGet } from '@/lib/medplum-client';
import { fromFHIRPatient } from '@hh/fhir';
import type { Patient } from '@medplum/fhirtypes';
import { PatientDetailClient } from './PatientDetailClient';

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const session = await auth();

  let patient;
  try {
    const fhir = await fhirGet<Patient>('Patient', patientId, session?.user.projectId);
    patient = fromFHIRPatient(fhir);
  } catch {
    notFound();
  }

  return <PatientDetailClient patient={patient} />;
}
