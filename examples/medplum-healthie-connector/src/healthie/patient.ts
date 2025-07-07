import { ContactPoint, Patient } from '@medplum/fhirtypes';
import { HealthieClient } from './client';
import { HEALTHIE_USER_ID_SYSTEM } from './constants';

/**
 * Interface for Healthie location data.
 */
export interface HealthieLocation {
  zip: string;
  line1: string;
  line2: string;
  to_oneline: string;
  city: string;
  country: string;
  cursor: string;
  state: string;
}

/**
 * Interface for Healthie patient/user data.
 */
export interface HealthiePatient {
  id: string;
  active: boolean;
  name: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  gender: string;
  gender_identity: string;
  sex: string;
  sexual_orientation: string;
  locations: HealthieLocation[];
}

/**
 * Fetches patients from Healthie.
 * @param healthie - The Healthie client instance to use for API calls.
 * @returns An array of patient data.
 */
export async function fetchHealthiePatients(healthie: HealthieClient): Promise<HealthiePatient[]> {
  const query = `
    query {
      users {
        id
        active
        name
        first_name
        last_name
        phone_number
        gender
        gender_identity
        sex
        sexual_orientation
        locations {
          zip
          line1
          line2
          to_oneline
          city
          country
          cursor
          state
        }
      }
    }
  `;

  const result = await healthie.query<{ users: HealthiePatient[] }>(query);
  return result.users ?? [];
}

export function convertHealthiePatientToFhir(healthiePatient: HealthiePatient): Patient {
  const telecom: ContactPoint[] = [];
  if (healthiePatient.phone_number) {
    telecom.push({
      system: 'phone',
      value: healthiePatient.phone_number,
    });
  }
  // Create a FHIR Patient resource from Healthie patient data
  const fhirPatient: Patient = {
    resourceType: 'Patient',
    // Add Healthie user ID as an identifier to link the systems
    identifier: [
      {
        system: HEALTHIE_USER_ID_SYSTEM,
        value: healthiePatient.id,
      },
    ],
    // Map patient name information
    name: [
      {
        given: [healthiePatient.first_name],
        family: healthiePatient.last_name,
      },
    ],

    telecom,

    // Map address information if available
    address:
      healthiePatient.locations && healthiePatient.locations.length > 0
        ? [
            {
              line: [healthiePatient.locations[0].line1],
              city: healthiePatient.locations[0].city,
              state: healthiePatient.locations[0].state,
              postalCode: healthiePatient.locations[0].zip,
              country: healthiePatient.locations[0].country,
            },
          ]
        : undefined,
    // Map gender with appropriate transformation
    gender: healthiePatient.gender ? mapHealthieGender(healthiePatient.gender) : undefined,
  };
  return fhirPatient;
}

/**
 * Maps Healthie gender values to FHIR gender values.
 * @param healthieGender - The gender value from Healthie.
 * @returns A FHIR-compliant gender value.
 */
export function mapHealthieGender(healthieGender?: string): Patient['gender'] {
  if (!healthieGender) {
    return 'unknown';
  }

  const lowerGender = healthieGender.toLowerCase();

  if (lowerGender === 'male') {
    return 'male';
  } else if (lowerGender === 'female') {
    return 'female';
  } else {
    return 'other';
  }
}
