import type { ClinicalImpression } from '@medplum/fhirtypes';
import { HH_EXT, getExtension } from '../extensions';

export interface SOAPNote {
  id?: string;
  patientId: string;
  practitionerId: string;
  appointmentId?: string;
  date: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

export function toFHIRClinicalImpression(note: SOAPNote): ClinicalImpression {
  return {
    resourceType: 'ClinicalImpression',
    ...(note.id && { id: note.id }),
    status: 'completed',
    subject: { reference: `Patient/${note.patientId}` },
    assessor: { reference: `Practitioner/${note.practitionerId}` },
    ...(note.appointmentId && { encounter: { reference: `Encounter/${note.appointmentId}` } }),
    date: note.date,
    note: [{ text: `[S] ${note.subjective}\n[O] ${note.objective}\n[A] ${note.assessment}\n[P] ${note.plan}` }],
    extension: [
      { url: HH_EXT.SOAP_S, valueString: note.subjective },
      { url: HH_EXT.SOAP_O, valueString: note.objective },
      { url: HH_EXT.SOAP_A, valueString: note.assessment },
      { url: HH_EXT.SOAP_P, valueString: note.plan },
    ],
  };
}

export function fromFHIRClinicalImpression(fhir: ClinicalImpression): SOAPNote {
  return {
    id: fhir.id,
    patientId: fhir.subject?.reference?.split('/')[1] ?? '',
    practitionerId: fhir.assessor?.reference?.split('/')[1] ?? '',
    date: fhir.date ?? new Date().toISOString(),
    subjective: getExtension(fhir as any, 'SOAP_S') ?? '',
    objective: getExtension(fhir as any, 'SOAP_O') ?? '',
    assessment: getExtension(fhir as any, 'SOAP_A') ?? '',
    plan: getExtension(fhir as any, 'SOAP_P') ?? '',
  };
}
