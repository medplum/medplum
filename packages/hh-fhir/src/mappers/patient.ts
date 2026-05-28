import type { Patient } from '@medplum/fhirtypes';
import type { HHPatient } from '@hh/core';
import { HH_EXT, getExtension } from '../extensions';

export function toFHIRPatient(p: HHPatient): Patient {
  const ext: Patient['extension'] = [];
  if (p.cpf) ext.push({ url: HH_EXT.CPF, valueString: p.cpf });

  return {
    resourceType: 'Patient',
    ...(p.id && { id: p.id }),
    name: [{ text: p.name }],
    telecom: [
      { system: 'phone', value: p.phone, use: 'mobile' },
      ...(p.email ? [{ system: 'email' as const, value: p.email }] : []),
    ],
    ...(p.birthDate && { birthDate: p.birthDate }),
    ...(p.notes && { text: { status: 'additional' as const, div: p.notes } }),
    ...(ext.length && { extension: ext }),
  };
}

export function fromFHIRPatient(fhir: Patient): HHPatient {
  return {
    id: fhir.id ?? '',
    name: fhir.name?.[0]?.text ?? fhir.name?.[0]?.family ?? '',
    phone: fhir.telecom?.find((t) => t.system === 'phone')?.value ?? '',
    email: fhir.telecom?.find((t) => t.system === 'email')?.value,
    cpf: getExtension(fhir, 'CPF'),
    birthDate: fhir.birthDate,
    notes: fhir.text?.div,
    createdAt: fhir.meta?.lastUpdated ?? new Date().toISOString(),
  };
}
