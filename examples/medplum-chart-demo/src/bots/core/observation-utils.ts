import { Quantity } from '@medplum/fhirtypes';

/**
 * This function calculates the BMI of a patient based on their height and weight. Reference: https://my.clevelandclinic.org/health/articles/9464-body-mass-index-bmi
 *
 * @param height - The height of the patient
 * @param weight - The weight of the patient
 * @returns The BMI of the patient
 */
export function calculateBMI(height?: Quantity, weight?: Quantity): Quantity {
  if (!height?.value || !weight?.value) {
    throw new Error('All values must be provided');
  }
  const heightM = getHeightInMeters(height);
  const weightKg = getWeightInKilograms(weight);

  const bmi = Math.round((weightKg / heightM ** 2) * 10) / 10;
  return {
    value: bmi,
    unit: 'kg/m^2',
  };
}

function getWeightInKilograms(weight: Quantity): number {
  if (!weight.unit) {
    throw new Error('No unit defined');
  }
  const unit = weight.unit;
  const weightVal = weight.value as number;

  switch (unit) {
    case 'lb':
      return weightVal / 2.2;
    case 'kg':
      return weightVal;
    default:
      throw new Error('Unknown unit. Please provide weight in one of the following units: Pounds or kilograms.');
  }
}

function getHeightInMeters(height: Quantity): number {
  if (!height.unit) {
    throw new Error('No unit defined');
  }
  const unit = height.unit;
  const heightVal = height.value as number;

  switch (unit) {
    case 'in':
      return (heightVal * 2.54) / 100;
    case 'ft':
      return (heightVal * 12 * 2.54) / 100;
    case 'cm':
      return heightVal / 100;
    case 'm':
      return heightVal;
    default:
      throw new Error(
        'Unknown unit. Please provide height in one of the following units: Inches, feet, centimeters, or meters.'
      );
  }
}
