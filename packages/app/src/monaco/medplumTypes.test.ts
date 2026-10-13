// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getMedplumExtraLibs } from './medplumTypes';

describe('getMedplumExtraLibs', () => {
  const libs = getMedplumExtraLibs();
  const getLib = (filePath: string): string | undefined => libs.find((lib) => lib.filePath === filePath)?.content;

  test('Includes @medplum/core', () => {
    expect(getLib('file:///node_modules/@medplum/core/index.d.ts')).toContain('export declare class MedplumClient');
  });

  test('Includes @medplum/fhirtypes', () => {
    expect(getLib('file:///node_modules/@medplum/fhirtypes/index.d.ts')).toContain("from './Patient.d.ts'");
    expect(getLib('file:///node_modules/@medplum/fhirtypes/Patient.d.ts')).toContain('export interface Patient');
  });

  test('Declares other Bot runtime packages', () => {
    const shims = getLib('file:///node_modules/@types/bot-layer-shims/index.d.ts');
    expect(shims).toContain("declare module 'jszip';");
    expect(shims).toContain("declare module '@medplum/ccda';");
    expect(shims).not.toContain("declare module '@medplum/core';");
  });

  test('Declares Node.js built-ins', () => {
    const shims = getLib('file:///node_modules/@types/bot-layer-shims/index.d.ts');
    expect(shims).toContain("declare module 'crypto';");
    expect(shims).toContain("declare module 'node:crypto';");
    expect(shims).toContain("declare module 'fs/promises';");
  });
});
