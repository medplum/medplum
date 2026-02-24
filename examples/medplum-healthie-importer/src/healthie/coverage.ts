// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { CodeableConcept, Coverage, Patient, Reference } from '@medplum/fhirtypes';
import type { HealthieClient } from './client';
import { HEALTHIE_POLICY_ID_SYSTEM } from './constants';

/**
 * Interface representing an insurance policy from Healthie API
 */
export interface HealthiePolicy {
  /** The unique identifier of the policy */
  id: string;
  /** Insurance member/subscriber number */
  num?: string;
  /** Group number on the insurance plan */
  group_num?: string;
  /** Priority type of the policy (e.g., "primary", "secondary") */
  priority_type?: string;
  /** Relationship of the policy holder to the patient */
  holder_relationship?: string;
  /** First name of the policy holder */
  holder_first?: string;
  /** Last name of the policy holder */
  holder_last?: string;
  /** Date of birth of the policy holder */
  holder_dob?: string;
  /** Gender of the policy holder */
  holder_gender?: string;
  /** Phone number of the policy holder */
  holder_phone?: string;
  /** Middle initial of the policy holder */
  holder_mi?: string;
  /** Address of the policy holder */
  holder_address?: string;
  /** Location ID of the policy holder */
  holder_location_id?: string;
  /** Effective start date of the policy */
  effective_start?: string;
  /** Effective end date of the policy */
  effective_end?: string;
  /** Copay amount in dollars */
  copay_value?: number;
  /** Coinsurance amount in dollars */
  coinsurance_value?: number;
  /** Associated insurance plan */
  insurance_plan?: {
    /** The unique identifier of the insurance plan */
    id: string;
    /** Name of the insurance payer */
    payer_name?: string;
  };
  /** ID of the insurance card front image */
  insurance_card_front_id?: string;
  /** ID of the insurance card back image */
  insurance_card_back_id?: string;
  /** User ID of the client this policy belongs to */
  user_id?: string;
  /** Notes about the policy */
  notes?: string;
  /** Display name of the policy */
  name?: string;
  /** The last time the policy was updated */
  updated_at?: string;
}

/**
 * Fetches insurance policies for a specific patient.
 * Policies must be queried through the User object, not directly.
 * @param healthie - The Healthie client instance to use for API calls.
 * @param patientId - The ID of the patient.
 * @returns An array of policy data.
 */
export async function fetchPolicies(healthie: HealthieClient, patientId: string): Promise<HealthiePolicy[]> {
  const query = `
    query fetchPolicies($patientId: ID!) {
      user(id: $patientId) {
        policies {
          id
          num
          group_num
          priority_type
          holder_relationship
          holder_first
          holder_last
          holder_dob
          holder_gender
          holder_phone
          holder_mi
          effective_start
          effective_end
          copay_value
          coinsurance_value
          insurance_plan { id payer_name }
          insurance_card_front_id
          insurance_card_back_id
          name
          notes
          updated_at
        }
      }
    }
  `;
  const result = await healthie.query<{
    user: { policies: HealthiePolicy[] } | null;
  }>(query, { patientId });
  return result.user?.policies ?? [];
}

/**
 * Converts a Healthie insurance policy to a FHIR Coverage resource.
 * @param policy - The Healthie policy object.
 * @param patientReference - The reference to the patient.
 * @returns A FHIR Coverage resource.
 */
export function convertHealthiePolicyToFhir(policy: HealthiePolicy, patientReference: Reference<Patient>): Coverage {
  const coverage: Coverage = {
    resourceType: 'Coverage',
    identifier: [{ system: HEALTHIE_POLICY_ID_SYSTEM, value: policy.id }],
    status: 'active',
    beneficiary: patientReference,
    payor: policy.insurance_plan?.payer_name ? [{ display: policy.insurance_plan.payer_name }] : [patientReference],
    relationship: mapHolderRelationship(policy.holder_relationship),
    order: mapPriorityType(policy.priority_type),
    subscriberId: policy.num || undefined,
  };

  if (policy.effective_start || policy.effective_end) {
    coverage.period = {
      start: policy.effective_start || undefined,
      end: policy.effective_end || undefined,
    };
  }

  if (policy.group_num) {
    coverage.class = [
      {
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-class', code: 'group' }],
        },
        value: policy.group_num,
      },
    ];
  }

  if (policy.holder_first || policy.holder_last) {
    coverage.subscriber = {
      display: `${policy.holder_first ?? ''} ${policy.holder_last ?? ''}`.trim(),
    };
  }

  const costItems: Coverage['costToBeneficiary'] = [];
  if (policy.copay_value !== undefined && policy.copay_value !== null) {
    costItems.push({
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-copay-type', code: 'copay' }],
      },
      valueMoney: { value: policy.copay_value, currency: 'USD' },
    });
  }
  if (policy.coinsurance_value !== undefined && policy.coinsurance_value !== null) {
    costItems.push({
      type: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/coverage-copay-type', code: 'coinsurance' }],
      },
      valueMoney: { value: policy.coinsurance_value, currency: 'USD' },
    });
  }
  if (costItems.length > 0) {
    coverage.costToBeneficiary = costItems;
  }

  return coverage;
}

/**
 * Maps Healthie priority_type values to FHIR Coverage order values.
 * @param priority - The priority_type value from Healthie.
 * @returns A FHIR-compliant order number (1=primary, 2=secondary, 3=tertiary).
 */
export function mapPriorityType(priority?: string): number | undefined {
  if (!priority) {
    return undefined;
  }
  switch (priority.toLowerCase()) {
    case 'primary':
      return 1;
    case 'secondary':
      return 2;
    case 'tertiary':
      return 3;
    default:
      return undefined;
  }
}

/**
 * Maps Healthie holder_relationship values to FHIR subscriber-relationship CodeableConcept.
 * @param rel - The holder_relationship value from Healthie (e.g., "Spouse", "Self").
 * @returns A FHIR-compliant CodeableConcept or undefined if not provided.
 */
export function mapHolderRelationship(rel?: string): CodeableConcept | undefined {
  if (!rel) {
    return undefined;
  }
  const system = 'http://terminology.hl7.org/CodeSystem/subscriber-relationship';
  const map: Record<string, string> = {
    self: 'self',
    spouse: 'spouse',
    child: 'child',
    parent: 'parent',
    common_law: 'common',
    domestic_partner: 'common',
    life_partner: 'common',
    other: 'other',
    guardian: 'other',
  };
  const code = map[rel.toLowerCase()] ?? 'other';
  return { coding: [{ system, code }] };
}
