import { fhirSearch } from '@/lib/medplum-client';
import { fromFHIRPatient } from '@hh/fhir';
import { PatientList } from '@/components/patients/PatientList';
import type { Patient } from '@medplum/fhirtypes';

export default async function PacientesPage() {
  const patients = await fhirSearch<Patient>('Patient', { _sort: '-_lastUpdated', _count: '50' });
  const initial = patients.map(fromFHIRPatient);
  return <PatientList initial={initial} />;
}
