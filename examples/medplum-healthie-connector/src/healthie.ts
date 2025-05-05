import { Patient, Quantity } from '@medplum/fhirtypes';

/**
 * HealthieClient provides methods to interact with the Healthie API.
 */
export class HealthieClient {
  private baseURL: string;
  private clientSecret: string;

  /**
   * Creates a new HealthieClient instance.
   * @param baseURL - The base URL for the Healthie API.
   * @param clientSecret - The API secret for authentication.
   */
  constructor(baseURL: string, clientSecret: string) {
    this.baseURL = baseURL;
    this.clientSecret = clientSecret;
  }

  /**
   * Executes a GraphQL query against the Healthie API.
   * @param query - The GraphQL query string.
   * @param variables - Optional variables for the GraphQL query.
   * @returns The query result data.
   */
  async query<T>(query: string, variables: Record<string, any> = {}): Promise<T> {
    if (!this.clientSecret) {
      throw new Error('Healthie credentials not provided');
    }

    const response = await fetch(this.baseURL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.clientSecret}`,
        AuthorizationSource: 'API',
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    const result = (await response.json()) as HealthieGraphQLResponse<T>;

    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL Error: ${result.errors.map((e) => e.message).join(', ')}`);
    }

    if (!result.data) {
      throw new Error('No data returned from Healthie API');
    }

    return result.data;
  }

  /**
   * Fetches patients from Healthie.
   * @returns An array of patient data.
   */
  async fetchPatients(): Promise<any[]> {
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

    const result = await this.query<{ users: any[] }>(query);
    return result.users ?? [];
  }

  /**
   * Fetches medications for a specific patient.
   * @param patientId - The ID of the patient.
   * @returns An array of medication data.
   */
  async fetchMedications(patientId: string): Promise<HealthieMedicationType[]> {
    const query = `
      query {
        medications(userId: "${patientId}") {
          id
          name
          active
          directions
          dosage
          code
          start_date
          end_date
          comment
          created_at
          frequency
          mirrored
          requires_consolidation
          route
          updated_at
          user_id
        }
      }
    `;

    const result = await this.query<{ medications: HealthieMedicationType[] }>(query);
    return result.medications ?? [];
  }
}

/**
 * Interface for Healthie GraphQL API responses.
 */
interface HealthieGraphQLResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

export const HEALTHIE_IDENTIFIER_SYSTEM = 'https://www.gethealthie.com';
export const HEALTHIE_USER_ID_SYSTEM = `${HEALTHIE_IDENTIFIER_SYSTEM}/userId`;
export const HEALTHIE_MEDICATION_ID_SYSTEM = `${HEALTHIE_IDENTIFIER_SYSTEM}/medicationId`;
export const HEALTHIE_MEDICATION_CODE_SYSTEM = `${HEALTHIE_IDENTIFIER_SYSTEM}/medicationCode`;

/**
 * Parses a Healthie medication dosage string into a FHIR Quantity.
 * @param dosageString - The dosage string (e.g., "10 MG").
 * @returns A FHIR Quantity object or undefined if invalid.
 */
export function parseDosage(dosageString?: string): Quantity | undefined {
  if (!dosageString) {
    return undefined;
  }

  // Split the string into value and unit parts
  const match = dosageString.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z]+)$/);
  if (!match) {
    return undefined;
  }

  const [, valueStr, unit] = match;
  const value = parseFloat(valueStr);

  return {
    value,
    unit,
    system: 'http://unitsofmeasure.org',
  };
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

/**
 * Interface representing a medication from Healthie API
 */
export interface HealthieMedicationType {
  /** The unique identifier of the medication */
  id: string;
  /** Name of medication */
  name?: string;
  /** Indicates if medication is still active */
  active?: boolean;
  /** Directions to use medication entered by provider */
  directions?: string;
  /** Dosage of medication entered by provider */
  dosage?: string;
  /** CCDA code for this medication */
  code?: string;
  /** First active date of medication */
  start_date?: string;
  /** last date patient should be able to use medication */
  end_date?: string;
  /** Comments entered by provider */
  comment?: string;
  /** The time the medication was created */
  created_at: string;
  /** Frequency of this medication */
  frequency?: string;
  /** If the medication is synchronized with an external system */
  mirrored: boolean;
  /** When true, this object must be consolidated as part of a CCDA Ingest */
  requires_consolidation?: boolean;
  /** The way this medication is administered */
  route?: string;
  /** The last time the medication was updated */
  updated_at?: string;
  /** User ID of the client this medication belongs to */
  user_id?: string;
}
