// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';

export interface SpaceModelOption {
  value: string;
  label: string;
}

/**
 * Name of the Project.setting entry that holds the list of selectable AI models.
 * The value should be a JSON-encoded array of {@link SpaceModelOption} objects, e.g.
 * `[{"value":"gpt-5.5","label":"GPT-5.5"},{"value":"my-litellm-model","label":"Custom"}]`.
 * Manage it from the project admin "Settings" page.
 */
export const AI_MODELS_SETTING = 'aiModels';

/** Built-in fallback used when the project has not configured `aiModels`. */
export const DEFAULT_MODELS: SpaceModelOption[] = [
  { value: 'gpt-5-mini', label: 'GPT-5 Mini' },
  { value: 'gpt-5.4', label: 'GPT-5.4' },
  { value: 'gpt-5.5', label: 'GPT-5.5' },
];

/**
 * Reads the selectable AI model list from the current project's settings.
 * Falls back to {@link DEFAULT_MODELS} when the setting is missing, empty, or malformed.
 * @param medplum - The Medplum client.
 * @returns The list of model options to show in the model picker.
 */
export function getProjectModels(medplum: MedplumClient): SpaceModelOption[] {
  const valueString = medplum.getProject()?.setting?.find((s) => s.name === AI_MODELS_SETTING)?.valueString;
  if (valueString) {
    try {
      const parsed = JSON.parse(valueString);
      if (Array.isArray(parsed)) {
        const models = parsed
          .filter(
            (m): m is { value: string; label?: unknown } =>
              Boolean(m) && typeof m.value === 'string' && m.value.length > 0
          )
          .map((m) => ({ value: m.value, label: typeof m.label === 'string' && m.label ? m.label : m.value }));
        if (models.length > 0) {
          return models;
        }
      }
    } catch {
      // Ignore malformed JSON and fall back to defaults.
    }
  }
  return DEFAULT_MODELS;
}

/**
 * Returns the default model value to preselect — the first entry in the list.
 * @param models - The available model options.
 * @returns The default model value.
 */
export function getDefaultModel(models: SpaceModelOption[]): string {
  return models[0]?.value ?? DEFAULT_MODELS[0].value;
}
