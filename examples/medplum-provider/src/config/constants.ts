// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export const SAVE_TIMEOUT_MS = 1500;

// Required by the AMA CPT license wherever CPT content appears, below the first mention of CPT.
// Changing the wording or the placement needs AMA re-review.
export const CPT_COPYRIGHT_NOTICE = `CPT® copyright ${new Date().getFullYear()} American Medical Association. All rights reserved.`;

/**
 * The ValueSet of procedure modifiers, registered from the Get Started page. It selects the modifier concepts of
 * the CPT code system by their UMLS term type, so it only expands once CPT is loaded in the project.
 */
export const PROCEDURE_MODIFIERS_VALUE_SET = 'https://medplum.com/fhir/ValueSet/procedure-modifiers';
