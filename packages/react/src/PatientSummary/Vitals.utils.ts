import { LOINC, UCUM, createReference } from '@medplum/core';
import { CodeableConcept, Encounter, Observation, ObservationComponent, Patient, Quantity } from '@medplum/fhirtypes';

export function getObservationValue(observations: Observation[], code: string): Quantity | undefined {
  const observation = observations.find((o) => o.code?.coding?.[0].code === code);
  return observation?.valueQuantity;
}

export function getCompoundObservationValue(
  observations: Observation[],
  code: string,
  innerCode: string
): Quantity | undefined {
  const observation = observations.find((o) => o.code?.coding?.[0].code === code);
  const component = observation?.component?.find((c) => c.code?.coding?.[0].code === innerCode);
  return component?.valueQuantity;
}

export function createObservation(
  patient: Patient,
  encounter: Encounter | undefined,
  code: string,
  title: string,
  valueQuantity: Quantity
): Observation | undefined {
  if (!isValidNumber(valueQuantity.value)) {
    return undefined;
  }
  return {
    ...createBaseObservation(patient, encounter, code, title),
    valueQuantity,
  };
}

export function createCompoundObservation(
  patient: Patient,
  encounter: Encounter | undefined,
  code: string,
  title: string,
  components: ObservationComponent[]
): Observation | undefined {
  const component = components.filter((c) => isValidNumber(c.valueQuantity?.value));
  if (component.length === 0) {
    return undefined;
  }
  return {
    ...createBaseObservation(patient, encounter, code, title),
    component,
  };
}

export function createBaseObservation(
  patient: Patient,
  encounter: Encounter | undefined,
  code: string,
  title: string
): Observation {
  return {
    resourceType: 'Observation',
    status: 'preliminary',
    subject: createReference(patient),
    encounter: encounter ? createReference(encounter) : undefined,
    effectiveDateTime: new Date().toISOString(),
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
            display: 'Vital Signs',
          },
        ],
      },
    ],
    code: createLoincCode(code, title),
  };
}

export function createLoincCode(code: string, display: string): CodeableConcept {
  return {
    coding: [
      {
        code,
        display,
        system: LOINC,
      },
    ],
    text: display,
  };
}

export function createQuantity(value: number, unit: string): Quantity {
  return {
    value,
    system: UCUM,
    unit,
    code: unit,
  };
}

function isValidNumber(value: number | undefined): boolean {
  return value !== undefined && !isNaN(value) && isFinite(value);
}
