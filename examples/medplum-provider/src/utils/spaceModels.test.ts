// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedplumClient } from '@medplum/core';
import type { Project, ProjectSetting } from '@medplum/fhirtypes';
import { describe, expect, test } from 'vitest';
import { DEFAULT_MODELS, getDefaultModel, getProjectModels } from './spaceModels';

function mockMedplum(setting?: ProjectSetting[]): MedplumClient {
  const project: Project = { resourceType: 'Project', setting };
  return { getProject: () => project } as unknown as MedplumClient;
}

describe('getProjectModels', () => {
  test('returns defaults when no project setting', () => {
    expect(getProjectModels(mockMedplum())).toEqual(DEFAULT_MODELS);
  });

  test('returns defaults when aiModels setting absent', () => {
    expect(getProjectModels(mockMedplum([{ name: 'other', valueString: 'x' }]))).toEqual(DEFAULT_MODELS);
  });

  test('parses configured models', () => {
    const models = [
      { value: 'gpt-5.5', label: 'GPT-5.5' },
      { value: 'my-litellm-model', label: 'Custom' },
    ];
    const result = getProjectModels(mockMedplum([{ name: 'aiModels', valueString: JSON.stringify(models) }]));
    expect(result).toEqual(models);
  });

  test('falls back to value when label missing', () => {
    const result = getProjectModels(
      mockMedplum([{ name: 'aiModels', valueString: JSON.stringify([{ value: 'raw-model' }]) }])
    );
    expect(result).toEqual([{ value: 'raw-model', label: 'raw-model' }]);
  });

  test('drops invalid entries', () => {
    const result = getProjectModels(
      mockMedplum([
        {
          name: 'aiModels',
          valueString: JSON.stringify([{ value: 'ok', label: 'OK' }, { label: 'no value' }, null, 'string']),
        },
      ])
    );
    expect(result).toEqual([{ value: 'ok', label: 'OK' }]);
  });

  test('returns defaults on malformed JSON', () => {
    expect(getProjectModels(mockMedplum([{ name: 'aiModels', valueString: 'not json' }]))).toEqual(DEFAULT_MODELS);
  });

  test('returns defaults when configured list is empty', () => {
    expect(getProjectModels(mockMedplum([{ name: 'aiModels', valueString: '[]' }]))).toEqual(DEFAULT_MODELS);
  });
});

describe('getDefaultModel', () => {
  test('returns first model value', () => {
    expect(
      getDefaultModel([
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ])
    ).toBe('a');
  });

  test('falls back to built-in default when empty', () => {
    expect(getDefaultModel([])).toBe(DEFAULT_MODELS[0].value);
  });
});
