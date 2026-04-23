// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { LOINC } from '@medplum/core';
import type { MedplumClient } from '@medplum/core';
import type { CodeableConcept, ConceptMap, Organization } from '@medplum/fhirtypes';
import { COMMON_LOINC_CODES } from './utils';

/**
 * Identifier system for Organization-scoped lab test code mappings.
 * Each performing Organization gets its own ConceptMap keyed by this system + the Org id.
 */
export const LAB_CODE_MAP_IDENTIFIER_SYSTEM = 'http://medplum.com/fhir/ns/lab-code-map';

/**
 * Custom code system for lab test names as they appear on reports from a specific lab.
 * Used as the `source` for ConceptMap entries.
 */
export const LAB_TEST_NAME_SYSTEM = 'http://medplum.com/fhir/CodeSystem/lab-test-names';

/**
 * Tag used to mark an Observation as needing human code assignment.
 */
export const NEEDS_CODE_ASSIGNMENT_TAG = {
  system: 'http://medplum.com/fhir/Tag',
  code: 'needs-code-assignment',
  display: 'Needs code assignment',
};

/**
 * Extension URL for storing the LLM's suggested code (for reviewer reference only,
 * NEVER applied to code.coding automatically).
 */
export const SUGGESTED_CODING_EXTENSION_URL = 'http://medplum.com/fhir/StructureDefinition/llm-suggested-coding';

export interface CodeResolution {
  /** The resolved CodeableConcept to use on the Observation. */
  code: CodeableConcept;
  /** Whether the code was found in a trusted mapping (ConceptMap or built-in). */
  mapped: boolean;
  /** The source of the mapping, for audit. */
  source?: 'concept-map' | 'built-in';
}

/**
 * Resolve a lab test name to a CodeableConcept using an ordered lookup:
 * 1. Organization-scoped ConceptMap (customer-maintained, self-improving via reviewer feedback)
 * 2. Built-in default mappings for common tests
 * 3. Unmapped fallback (code.text only, caller should tag for human review)
 *
 * This function NEVER trusts codes suggested by the parsing provider (LLM).
 * LLM suggestions should be stored separately as extensions for reviewer reference.
 */
export async function resolveCoding(
  medplum: MedplumClient,
  organizationId: string | undefined,
  testName: string
): Promise<CodeResolution> {
  const normalized = testName.toLowerCase().trim();

  // 1. Organization-scoped ConceptMap lookup
  if (organizationId) {
    const orgMap = await loadOrganizationMap(medplum, organizationId);
    const mapped = orgMap.get(normalized);
    if (mapped) {
      return { code: { ...mapped, text: testName }, mapped: true, source: 'concept-map' };
    }
  }

  // 2. Built-in default mappings
  const builtIn = COMMON_LOINC_CODES[normalized];
  if (builtIn) {
    return { code: { ...builtIn, text: testName }, mapped: true, source: 'built-in' };
  }

  // 3. Unmapped: return text-only CodeableConcept
  return { code: { text: testName }, mapped: false };
}

/**
 * Load all mappings for an Organization from its ConceptMap into a Map keyed by
 * lowercase test name.
 */
async function loadOrganizationMap(
  medplum: MedplumClient,
  organizationId: string
): Promise<Map<string, CodeableConcept>> {
  const conceptMap = await medplum.searchOne('ConceptMap', {
    identifier: `${LAB_CODE_MAP_IDENTIFIER_SYSTEM}|${organizationId}`,
  });

  const result = new Map<string, CodeableConcept>();
  if (!conceptMap) {
    return result;
  }

  for (const group of conceptMap.group || []) {
    const targetSystem = group.target || LOINC;
    for (const element of group.element || []) {
      if (!element.code) {
        continue;
      }
      const firstTarget = element.target?.[0];
      if (!firstTarget?.code) {
        continue;
      }
      result.set(element.code.toLowerCase(), {
        coding: [
          {
            system: targetSystem,
            code: firstTarget.code,
            display: firstTarget.display,
          },
        ],
      });
    }
  }

  return result;
}

/**
 * Upsert a mapping into the Organization's ConceptMap.
 * Creates the ConceptMap if it doesn't exist.
 *
 * Called by the Finalize Bot when a reviewer assigns a code, so future reports
 * from the same lab auto-map that test name.
 */
export async function upsertMapping(
  medplum: MedplumClient,
  organization: Organization,
  testName: string,
  targetCoding: { system: string; code: string; display?: string }
): Promise<void> {
  const organizationId = organization.id;
  if (!organizationId) {
    throw new Error('Organization must have an id to upsert a mapping');
  }

  const existing = await medplum.searchOne('ConceptMap', {
    identifier: `${LAB_CODE_MAP_IDENTIFIER_SYSTEM}|${organizationId}`,
  });

  const normalizedName = testName.toLowerCase().trim();
  const sourceSystem = `${LAB_TEST_NAME_SYSTEM}/${organizationId}`;

  if (!existing) {
    // Create a new ConceptMap for this Organization
    await medplum.createResource<ConceptMap>({
      resourceType: 'ConceptMap',
      status: 'active',
      name: `LabCodeMap-${organization.name || organizationId}`,
      title: `Lab test name mappings for ${organization.name || organizationId}`,
      identifier: {
        system: LAB_CODE_MAP_IDENTIFIER_SYSTEM,
        value: organizationId,
      },
      sourceUri: sourceSystem,
      targetUri: targetCoding.system,
      group: [
        {
          source: sourceSystem,
          target: targetCoding.system,
          element: [
            {
              code: normalizedName,
              display: testName,
              target: [
                {
                  code: targetCoding.code,
                  display: targetCoding.display,
                  equivalence: 'equivalent',
                },
              ],
            },
          ],
        },
      ],
    });
    return;
  }

  // Update the existing ConceptMap
  const groups = existing.group ? [...existing.group] : [];
  let group = groups.find((g) => g.target === targetCoding.system);

  if (!group) {
    group = {
      source: sourceSystem,
      target: targetCoding.system,
      element: [],
    };
    groups.push(group);
  }

  const elements = group.element ? [...group.element] : [];
  const existingIdx = elements.findIndex((e) => e.code?.toLowerCase() === normalizedName);

  const newElement = {
    code: normalizedName,
    display: testName,
    target: [
      {
        code: targetCoding.code,
        display: targetCoding.display,
        equivalence: 'equivalent' as const,
      },
    ],
  };

  if (existingIdx >= 0) {
    elements[existingIdx] = newElement;
  } else {
    elements.push(newElement);
  }

  group.element = elements;

  await medplum.updateResource<ConceptMap>({
    ...existing,
    group: groups,
  });
}
