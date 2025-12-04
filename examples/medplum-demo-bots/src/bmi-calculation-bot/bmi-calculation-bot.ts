// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, getReferenceString, LOINC, UCUM } from '@medplum/core';
import type { BotEvent, MedplumClient } from '@medplum/core';
import type { CodeableConcept, Observation, Patient } from '@medplum/fhirtypes';

/**
 * BMI Calculation Bot
 *
 * This bot processes a Patient resource and:
 * 1. Searches for height and weight observations
 * 2. Finds the latest observation of each type
 * 3. Calculates BMI from the latest height and weight
 * 4. Creates a BMI Observation
 */

// LOINC codes for observations
const LOINC_HEIGHT = '8302-2'; // Body height
const LOINC_WEIGHT = '29463-7'; // Body weight
const LOINC_BMI = '39156-5'; // Body mass index (BMI) [Ratio]

// Observation category for vital signs
const VITAL_SIGNS_CATEGORY: CodeableConcept = {
  coding: [
    {
      system: 'http://terminology.hl7.org/CodeSystem/observation-category',
      code: 'vital-signs',
      display: 'Vital Signs',
    },
  ],
};

/**
 * Calculates BMI from weight (kg) and height (m)
 * BMI = weight (kg) / (height (m))^2
 * @param weightKg - Weight in kilograms
 * @param heightM - Height in meters
 * @returns The calculated BMI
 */
function calculateBMI(weightKg: number, heightM: number): number {
  if (heightM <= 0) {
    throw new Error('Height must be greater than 0');
  }
  return weightKg / (heightM * heightM);
}

/**
 * Gets the latest observation for a given code
 * @param medplum - The Medplum client
 * @param patient - The patient resource
 * @param code - The LOINC code to search for
 * @returns The latest observation, or undefined if none found
 */
async function getLatestObservation(
  medplum: MedplumClient,
  patient: Patient,
  code: string
): Promise<Observation | undefined> {
  const observations = await medplum.searchResources('Observation', {
    patient: getReferenceString(patient),
    code: `${LOINC}|${code}`,
    _sort: '-date',
    _count: 1,
  });

  return observations[0];
}

/**
 * Extracts numeric value from an observation
 * @param observation - The observation to extract value from
 * @returns The numeric value, or undefined if not available
 */
function getObservationValue(observation: Observation): number | undefined {
  const quantity = observation.valueQuantity;
  if (quantity?.value !== undefined) {
    return quantity.value;
  }
  return undefined;
}

/**
 * Main bot handler
 * @param medplum - The Medplum client
 * @param event - The bot event containing the Patient resource
 */
export async function handler(medplum: MedplumClient, event: BotEvent<Patient>): Promise<void> {
  const patient = event.input;

  // Get the latest height observation
  const heightObservation = await getLatestObservation(medplum, patient, LOINC_HEIGHT);
  if (!heightObservation) {
    console.log(`No height observation found for patient ${getReferenceString(patient)}`);
    return;
  }

  // Get the latest weight observation
  const weightObservation = await getLatestObservation(medplum, patient, LOINC_WEIGHT);
  if (!weightObservation) {
    console.log(`No weight observation found for patient ${getReferenceString(patient)}`);
    return;
  }

  // Extract values from observations
  const heightValue = getObservationValue(heightObservation);
  const weightValue = getObservationValue(weightObservation);

  if (heightValue === undefined || weightValue === undefined) {
    console.log(
      `Missing values: height=${heightValue}, weight=${weightValue} for patient ${getReferenceString(patient)}`
    );
    return;
  }

  // Get units from observations
  const heightUnit = heightObservation.valueQuantity?.unit;
  const weightUnit = weightObservation.valueQuantity?.unit;

  // Convert height to meters
  // Common units: m (meters), cm (centimeters), in (inches)
  let heightM = heightValue;
  if (heightUnit?.toLowerCase().includes('cm') || heightUnit?.toLowerCase().includes('centimeter')) {
    heightM = heightValue / 100; // cm to m
  } else if (heightUnit?.toLowerCase().includes('in') || heightUnit?.toLowerCase().includes('inch')) {
    heightM = heightValue * 0.0254; // inches to m
  } else if (!heightUnit?.toLowerCase().includes('m') && !heightUnit?.toLowerCase().includes('meter')) {
    // If unit is not recognized and not already meters, assume it might be in a different format
    // Log a warning but try to proceed
    console.warn(`Unrecognized height unit: ${heightUnit}. Assuming meters.`);
  }

  // Convert weight to kilograms
  // Common units: kg (kilograms), g (grams), lb (pounds), oz (ounces)
  let weightKg = weightValue;
  if (weightUnit?.toLowerCase().includes('kg') && !weightUnit?.toLowerCase().includes('kg')) {
    weightKg = weightValue / 1000; // grams to kg
  } else if (weightUnit?.toLowerCase() === 'g' || weightUnit?.toLowerCase() === 'grams') {
    weightKg = weightValue / 1000; // grams to kg
  } else if (weightUnit?.toLowerCase() === 'mg' || weightUnit?.toLowerCase() === 'milligrams') {
    weightKg = weightValue / 1000000; // mg to kg
  } else if (weightUnit?.toLowerCase().includes('lb') || weightUnit?.toLowerCase().includes('pound')) {
    weightKg = weightValue * 0.453592; // pounds to kg
  } else if (weightUnit?.toLowerCase().includes('oz') || weightUnit?.toLowerCase().includes('ounce')) {
    weightKg = weightValue * 0.0283495; // ounces to kg
  } else if (!weightUnit?.toLowerCase().includes('kg') && !weightUnit?.toLowerCase().includes('kilogram')) {
    // If unit is not recognized and not already kg, assume it might be in a different format
    // Log a warning but try to proceed
    console.warn(`Unrecognized weight unit: ${weightUnit}. Assuming kilograms.`);
  }

  // Calculate BMI
  const bmi = calculateBMI(weightKg, heightM);

  // Create BMI observation
  const bmiObservation: Observation = {
    resourceType: 'Observation',
    status: 'final',
    subject: createReference(patient),
    code: {
      coding: [
        {
          system: LOINC,
          code: LOINC_BMI,
          display: 'Body mass index (BMI) [Ratio]',
        },
      ],
    },
    category: [VITAL_SIGNS_CATEGORY],
    valueQuantity: {
      value: bmi,
      unit: 'kg/m2',
      system: UCUM,
      code: 'kg/m2',
    },
    effectiveDateTime: new Date().toISOString(),
    derivedFrom: [createReference(heightObservation), createReference(weightObservation)],
  };

  // Create a new BMI observation (allows tracking BMI over time)
  await medplum.createResource(bmiObservation);

  console.log(`Created BMI observation: ${bmi.toFixed(2)} kg/m2 for patient ${getReferenceString(patient)}`);
}
