// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Ported from examples/medplum-demo-bots/src/deduplication/merge-matching-patients.ts
import type { WithId } from '@medplum/core';
import { createReference, deepClone, getReferenceString, isReference, resolveId } from '@medplum/core';
import type { Identifier, Patient } from '@medplum/fhirtypes';

/**
 * Represents two patient records that have been merged or are being merged.
 */
export interface MergedPatients {
  readonly src: WithId<Patient>;
  readonly target: WithId<Patient>;
}

/**
 * Links two patient records indicating one replaces the other.
 * The source patient will be marked as inactive and linked to the target with type 'replaced-by'.
 * The target patient will be linked to the source with type 'replaces'.
 *
 * @param src - The source patient record which is being replaced.
 * @param target - The target patient record which will replace the source.
 * @returns Object containing updated source and target patient records with their links.
 */
export function linkPatientRecords(src: WithId<Patient>, target: WithId<Patient>): MergedPatients {
  const targetCopy = deepClone(target);
  const targetLinks = targetCopy.link ?? [];
  targetLinks.push({ other: createReference(src), type: 'replaces' });

  const srcCopy = deepClone(src);
  const srcLinks = srcCopy.link ?? [];
  srcLinks.push({ other: createReference(target), type: 'replaced-by' });
  return { src: { ...srcCopy, link: srcLinks, active: false }, target: { ...targetCopy, link: targetLinks } };
}

/**
 * Unlinks two patients that have been merged.
 * Removes the merge links between source and target patients.
 * Note: This function does not change the active status of patients, as we cannot infer user intent.
 *
 * @param src - The source patient record which is marked as replaced.
 * @param target - The target patient marked as the master record.
 * @returns Object containing updated source and target patient records with their links removed.
 */
export function unlinkPatientRecords(src: WithId<Patient>, target: WithId<Patient>): MergedPatients {
  const targetCopy = deepClone(target);
  const srcCopy = deepClone(src);
  // Filter out links from the target to the source
  targetCopy.link = targetCopy.link?.filter((link) => resolveId(link.other) !== src.id);
  // Filter out links from the source to the target
  srcCopy.link = srcCopy.link?.filter((link) => resolveId(link.other) !== target.id);

  return { src: srcCopy, target: targetCopy };
}

/**
 * Merges identifiers and optional fields from source patient into target patient.
 * Identifiers from source that don't exist in target are added and marked as 'old'.
 * If an identifier system exists in both but with different values, an error is thrown.
 *
 * @param src - The source patient record.
 * @param target - The target patient record.
 * @param fields - Optional additional fields to be merged into the target.
 * @returns Object containing the original source and the merged target patient records.
 * @throws Error if identifiers with the same system have conflicting values.
 */
export function mergePatientRecords(
  src: WithId<Patient>,
  target: WithId<Patient>,
  fields?: Partial<Patient>
): MergedPatients {
  const targetCopy = deepClone(target);
  const mergedIdentifiers = targetCopy.identifier ?? [];
  const srcIdentifiers = src.identifier ?? [];

  // Check for conflicts between the source and target records' identifiers
  for (const srcIdentifier of srcIdentifiers) {
    const targetIdentifier = mergedIdentifiers?.find((identifier) => identifier.system === srcIdentifier.system);
    // If the targetRecord has an identifier with the same system, check if source and target agree on the identifier value
    if (targetIdentifier) {
      if (targetIdentifier.value !== srcIdentifier.value) {
        throw new Error(`Mismatched identifier for system ${srcIdentifier.system}`);
      }
    }
    // If this identifier is not present on the target, add it to the merged record and mark it as 'old'
    else {
      mergedIdentifiers.push({ ...srcIdentifier, use: 'old' } as Identifier);
    }
  }

  targetCopy.identifier = mergedIdentifiers;
  const targetMerged = { ...targetCopy, ...fields };
  return { src: src, target: targetMerged };
}

/**
 * Returns true if both the source and target patients are part of the same merged "cluster" of records.
 * There are three cases to handle:
 *   1. Both the source and target patients share the same master record (i.e. both replaced by the same record)
 *   2. The target record is the master record (i.e. target 'replaces' source)
 *   3. The source record is the master record (i.e. source 'replaces' target)
 *
 * @param src - The source patient record
 * @param target - The target patient record
 * @returns true if both the source and target patients are part of the same merged "cluster" of records.
 * @throws Error if the link structure is inconsistent (e.g., source replaced-by target but target doesn't have replaces link).
 */
export function patientsAlreadyMerged(src: Patient, target: Patient): boolean {
  const srcMaster = src.link?.find((link) => link.type === 'replaced-by')?.other;
  const targetMaster = target.link?.find((link) => link.type === 'replaced-by')?.other;

  // Case 1: Both patients share the same master record
  if (srcMaster && targetMaster && resolveId(srcMaster) === resolveId(targetMaster)) {
    return true;
  }

  // Case 2: The target record is the master record
  if (resolveId(srcMaster) === target.id) {
    if (!target.link?.find((link) => link.type === 'replaces' && resolveId(link.other) === src.id)) {
      throw new Error(
        `Target Patient ${getReferenceString(target)} missing a 'replaces' link to ${getReferenceString(src)}`
      );
    }
    return true;
  }

  // Case 3: The source record is the master record
  if (resolveId(targetMaster) === src.id) {
    if (!src.link?.find((link) => link.type === 'replaces' && resolveId(link.other) === target.id)) {
      throw new Error(
        `Source Patient ${getReferenceString(src)} missing a 'replaces' link to ${getReferenceString(target)}`
      );
    }
    return true;
  }

  return false;
}

/**
 * Recursively searches for all references to the source resource and translates them to the target resource.
 * This function mutates the input object in place.
 *
 * @param obj - A FHIR resource or element (will be mutated)
 * @param srcReference - The reference string referring to the source resource (e.g., "Patient/123")
 * @param targetReference - The reference string referring to the target resource (e.g., "Patient/456")
 */
export function replaceReferences(obj: any, srcReference: string, targetReference: string): void {
  for (const key in obj) {
    if (typeof obj[key] === 'object' && obj[key] !== null) {
      // Check if this is a Reference object
      if (isReference(obj[key])) {
        // If the reference matches the source, replace it with the target
        if (obj[key].reference === srcReference) {
          obj[key].reference = targetReference;
        }
      } else {
        // Recursively process nested objects
        replaceReferences(obj[key], srcReference, targetReference);
      }
    } else if (typeof obj[key] === 'string' && obj[key] === srcReference) {
      // Handle string references that are not wrapped in Reference objects
      obj[key] = targetReference;
    }
  }
}

