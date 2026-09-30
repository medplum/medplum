// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDataDir } from '@medplum/definitions';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { main } from '.';

describe('CLI generate-types', () => {
  let outputDir: string;

  beforeEach(() => {
    console.log = vi.fn();
    outputDir = mkdtempSync(join(tmpdir(), 'medplum-generate-types-'));
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  test('Generates types for profiles in a Bundle', async () => {
    const input = resolve(getDataDir(), 'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');
    await main(['node', 'index.js', 'generate-types', input, '--output-dir', outputDir]);

    expect(readdirSync(outputDir)).toContain('USCorePatientProfile.d.ts');
    expect(readdirSync(outputDir)).toContain('USCoreRaceExtension.d.ts');
    expect(readFileSync(join(outputDir, 'index.d.ts'), 'utf8')).toContain(
      "export type { USCorePatientProfile } from './USCorePatientProfile.d.ts';"
    );

    const patient = readFileSync(join(outputDir, 'USCorePatientProfile.d.ts'), 'utf8');
    expect(patient).toContain("'@medplum/fhirtypes';");
    expect(patient).toContain('export interface USCorePatientProfile {');
    expect(patient).toContain("readonly resourceType: 'Patient';");
    expect(patient).toContain('identifier: Identifier[];');

    const bloodPressure = readFileSync(join(outputDir, 'USCoreBloodPressureProfile.d.ts'), 'utf8');
    expect(bloodPressure).toContain('subject: Reference<Patient>;');
    expect(console.log).toHaveBeenCalledWith(`Generated 8 type definitions in ${outputDir}`);
  });
});
