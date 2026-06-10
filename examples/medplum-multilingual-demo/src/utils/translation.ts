// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Extension } from '@medplum/fhirtypes';

export const TRANSLATION_EXTENSION_URL = 'http://hl7.org/fhir/StructureDefinition/translation';

/**
 * Shadow element type — the `_fieldName` counterpart of any FHIR string primitive.
 * Carries extensions (including translation extensions) about the primitive value.
 */
export interface ShadowElement {
  extension?: Extension[];
}

/**
 * Returns the translation of a FHIR string primitive for the given BCP-47 language tag.
 * Falls back to the primary value if no exact match is found.
 *
 * @param primaryValue - The primary (default) string value of the field.
 * @param shadow - The `_fieldName` shadow element from the FHIR resource.
 * @param lang - BCP-47 language tag to look up (e.g. 'es', 'fr', 'zh').
 * @returns The translated string, or the primary value if no translation is found.
 */
export function getTranslation(
  primaryValue: string | undefined,
  shadow: ShadowElement | undefined,
  lang: string
): string | undefined {
  const translations = shadow?.extension?.filter((ext) => ext.url === TRANSLATION_EXTENSION_URL);

  for (const t of translations ?? []) {
    const langExt = t.extension?.find((e) => e.url === 'lang');
    const contentExt = t.extension?.find((e) => e.url === 'content');
    if (langExt?.valueCode === lang && contentExt?.valueString) {
      return contentExt.valueString;
    }
  }

  return primaryValue;
}

/**
 * Returns the best available translation for the given BCP-47 language tag.
 * Tries an exact match first (e.g. 'pt-BR'), then falls back to the base language
 * tag (e.g. 'pt'), then to the primary value.
 *
 * @param primaryValue - The primary (default) string value of the field.
 * @param shadow - The `_fieldName` shadow element from the FHIR resource.
 * @param lang - BCP-47 language tag to look up.
 * @returns The best available translated string, or the primary value if no translation is found.
 */
export function getBestTranslation(
  primaryValue: string | undefined,
  shadow: ShadowElement | undefined,
  lang: string
): string | undefined {
  // Try exact match first (e.g. 'pt-BR')
  const exact = getTranslation(primaryValue, shadow, lang);
  if (exact !== primaryValue) {
    return exact;
  }

  // Fall back to base language tag (e.g. 'pt')
  const baseLang = lang.split('-')[0];
  if (baseLang !== lang) {
    return getTranslation(primaryValue, shadow, baseLang);
  }

  return primaryValue;
}
