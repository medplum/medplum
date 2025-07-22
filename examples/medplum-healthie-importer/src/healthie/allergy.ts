import { AllergyIntolerance, Patient, Reference } from '@medplum/fhirtypes';
import { HealthieClient } from './client';
import { HEALTHIE_ALLERGY_CODE_SYSTEM, HEALTHIE_ALLERGY_ID_SYSTEM, HEALTHIE_REACTION_CODE_SYSTEM } from './constants';

/**
 * Interface representing an allergy/sensitivity from Healthie API
 */
export interface HealthieAllergySensitivity {
  /** The unique identifier of the allergy/sensitivity */
  id: string;
  /** Category of the allergy/sensitivity */
  category: 'allergy' | 'sensitivity' | 'preference' | 'intolerance' | 'ccda';
  /** Type of category */
  category_type?: 'food' | 'drug' | 'environmental' | 'pet' | 'latex' | 'like' | 'dislike';
  /** The time the allergy/sensitivity was created */
  created_at: string;
  /** Indicates if the allergy/sensitivity is synchronized with an external system */
  mirrored: boolean;
  /** Name of the allergy/sensitivity */
  name?: string;
  /** Date when the allergy/sensitivity first occurred */
  onset_date?: string;
  /** Reaction caused by the allergy/sensitivity */
  reaction?: string;
  /** Type of reaction */
  reaction_type?: 'allergy' | 'adverse_reaction';
  /** When true, this object must be consolidated as part of a CCDA Ingest */
  requires_consolidation?: boolean;
  /** Severity of the allergy/sensitivity */
  severity?: 'mild' | 'moderate' | 'severe' | 'unknown';
  /** Status of the allergy/sensitivity */
  status?: 'active' | 'inactive' | 'resolved';
  /** The last time the allergy/sensitivity was updated */
  updated_at?: string;
}

/**
 * Fetches allergies/sensitivities for a specific patient.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param patientId - The ID of the patient.
 * @returns An array of allergy/sensitivity data.
 */
export async function fetchAllergySensitivities(
  healthie: HealthieClient,
  patientId: string
): Promise<HealthieAllergySensitivity[]> {
  const query = `
    query fetchAllergySensitivities($patientId: ID!) {
      user(id: $patientId) {
        allergy_sensitivities {
          id
          category
          category_type
          created_at
          mirrored
          name
          onset_date
          reaction
          reaction_type
          requires_consolidation
          severity
          status
          updated_at
        }
      }
    }
  `;

  const result = await healthie.query<{ user: { allergy_sensitivities: HealthieAllergySensitivity[] } }>(query, {
    patientId,
  });
  return result.user?.allergy_sensitivities ?? [];
}

/**
 * Converts a Healthie allergy/sensitivity to a FHIR AllergyIntolerance.
 * @param allergy - The Healthie allergy/sensitivity object.
 * @param patientReference - The reference to the patient.
 * @returns A FHIR AllergyIntolerance resource.
 */
export function convertHealthieAllergyToFhir(
  allergy: HealthieAllergySensitivity,
  patientReference: Reference<Patient>
): AllergyIntolerance {
  const fhirAllergy: AllergyIntolerance = {
    resourceType: 'AllergyIntolerance',
    identifier: [{ system: HEALTHIE_ALLERGY_ID_SYSTEM, value: allergy.id }],
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          code: mapHealthieStatusToClinicalStatus(allergy.status),
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
          code: 'confirmed',
        },
      ],
    },
    type: mapHealthieCategoryToType(allergy.category),
    category: [mapHealthieCategoryTypeToCategory(allergy.category_type)],
    criticality: mapHealthieSeverityToCriticality(allergy.severity),
    patient: patientReference,
    onsetDateTime: allergy.onset_date?.trim() || undefined,
    code: {
      text: allergy.name,
      coding: [
        {
          system: HEALTHIE_ALLERGY_CODE_SYSTEM,
          code: allergy.name,
          display: allergy.name,
        },
      ],
    },
    reaction: allergy.reaction
      ? [
          {
            substance: {
              text: allergy.name,
              coding: [
                {
                  system: HEALTHIE_ALLERGY_CODE_SYSTEM,
                  code: allergy.name,
                  display: allergy.name,
                },
              ],
            },
            manifestation: [
              {
                text: allergy.reaction,
                coding: [
                  {
                    system: HEALTHIE_REACTION_CODE_SYSTEM,
                    code: allergy.reaction,
                    display: allergy.reaction,
                  },
                ],
              },
            ],
            severity: mapHealthieSeverityToReactionSeverity(allergy.severity),
          },
        ]
      : undefined,
    note: allergy.reaction ? [{ text: allergy.reaction }] : undefined,
  };

  return fhirAllergy;
}

/**
 * Maps Healthie status values to FHIR clinical status values.
 * @param status - The status value from Healthie.
 * @returns A FHIR-compliant clinical status code.
 */
export function mapHealthieStatusToClinicalStatus(status?: string): string {
  if (!status) {
    return 'active';
  }

  switch (status.toLowerCase()) {
    case 'active':
      return 'active';
    case 'inactive':
      return 'inactive';
    case 'resolved':
      return 'resolved';
    default:
      return 'active';
  }
}

/**
 * Maps Healthie category values to FHIR type values.
 * @param category - The category value from Healthie.
 * @returns A FHIR-compliant type value.
 */
export function mapHealthieCategoryToType(category: string): AllergyIntolerance['type'] {
  switch (category.toLowerCase()) {
    case 'allergy':
      return 'allergy';
    case 'intolerance':
      return 'intolerance';
    case 'sensitivity':
    case 'preference':
    case 'ccda':
    default:
      return 'allergy';
  }
}

/**
 * Maps Healthie category_type values to FHIR category values.
 * @param categoryType - The category_type value from Healthie.
 * @returns A FHIR-compliant category code.
 */
export function mapHealthieCategoryTypeToCategory(
  categoryType?: string
): 'food' | 'medication' | 'environment' | 'biologic' {
  if (!categoryType) {
    return 'environment';
  }

  switch (categoryType.toLowerCase()) {
    case 'food':
      return 'food';
    case 'drug':
      return 'medication';
    case 'environmental':
    case 'pet':
    case 'latex':
      return 'environment';
    default:
      return 'environment';
  }
}

/**
 * Maps Healthie severity values to FHIR criticality values.
 * @param severity - The severity value from Healthie.
 * @returns A FHIR-compliant criticality value.
 */
export function mapHealthieSeverityToCriticality(severity?: string): AllergyIntolerance['criticality'] {
  if (!severity) {
    return 'low';
  }

  switch (severity.toLowerCase()) {
    case 'mild':
      return 'low';
    case 'moderate':
      return 'low';
    case 'severe':
      return 'high';
    case 'unknown':
    default:
      return 'low';
  }
}

/**
 * Maps Healthie severity values to FHIR reaction severity values.
 * @param severity - The severity value from Healthie.
 * @returns A FHIR-compliant reaction severity value.
 */
export function mapHealthieSeverityToReactionSeverity(severity?: string): 'mild' | 'moderate' | 'severe' | undefined {
  if (!severity) {
    return undefined;
  }

  switch (severity.toLowerCase()) {
    case 'mild':
      return 'mild';
    case 'moderate':
      return 'moderate';
    case 'severe':
      return 'severe';
    case 'unknown':
    default:
      return undefined;
  }
}
