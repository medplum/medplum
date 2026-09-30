// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getDataDir } from '@medplum/definitions';
import type { StructureDefinition } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Mock } from 'vitest';
import { main } from '.';
import { createMedplumClient } from './util/client';

vi.mock('./util/client');

const US_CORE_PROFILES = resolve(getDataDir(), 'fhir/r4/testing/uscore-v5.0.1-structuredefinitions.json');

describe('CLI generate-types', () => {
  let outputDir: string;
  let medplum: MockClient;

  beforeAll(() => {
    process.exit = vi.fn<(exitCode?: number) => never>().mockImplementation(function exit(exitCode?: number) {
      throw new Error(`Process exited with exit code ${exitCode}`);
    });
  });

  beforeEach(() => {
    console.log = vi.fn();
    vi.spyOn(process.stderr, 'write').mockImplementation(vi.fn());
    outputDir = mkdtempSync(join(tmpdir(), 'medplum-generate-types-'));
    medplum = new MockClient();
    (createMedplumClient as unknown as Mock).mockImplementation(async () => medplum);
  });

  afterEach(() => {
    rmSync(outputDir, { recursive: true, force: true });
  });

  test('Generates types for profiles in a file', async () => {
    await main(['node', 'index.js', 'generate-types', US_CORE_PROFILES, '--output-dir', outputDir]);

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
    expect(patient).toContain("gender: NonNullable<Patient['gender']>;");

    // Profiles can restrict arrays to 0..1, but they are still arrays in JSON
    const device = readFileSync(join(outputDir, 'USCoreImplantableDeviceProfile.d.ts'), 'utf8');
    expect(device).toContain('udiCarrier?: USCoreImplantableDeviceProfileUdiCarrier[];');

    const bloodPressure = readFileSync(join(outputDir, 'USCoreBloodPressureProfile.d.ts'), 'utf8');
    expect(bloodPressure).toContain('subject: Reference<Patient>;');
    expect(console.log).toHaveBeenCalledWith(`Generated 8 type definitions in ${outputDir}`);
    expect(createMedplumClient).not.toHaveBeenCalled();
  });

  test('Generates types for profiles on the server', async () => {
    const sds = JSON.parse(readFileSync(US_CORE_PROFILES, 'utf8')) as StructureDefinition[];
    const patient = sds.find((sd) => sd.name === 'USCorePatientProfile') as StructureDefinition;
    const race = sds.find((sd) => sd.name === 'USCoreRaceExtension') as StructureDefinition;
    // MockClient does not support searching StructureDefinitions by url
    const searchOne = vi
      .spyOn(medplum, 'searchOne')
      .mockImplementation((async (_type: string, query: Record<string, string>) =>
        [patient, race].find((sd) => sd.url === query.url)) as any);

    await main([
      'node',
      'index.js',
      'generate-types',
      '--profile-url',
      patient.url,
      '--profile-url',
      race.url,
      '--output-dir',
      outputDir,
    ]);

    expect(readdirSync(outputDir).sort()).toStrictEqual([
      'USCorePatientProfile.d.ts',
      'USCoreRaceExtension.d.ts',
      'index.d.ts',
    ]);
    expect(readFileSync(join(outputDir, 'USCorePatientProfile.d.ts'), 'utf8')).toContain(
      'export interface USCorePatientProfile {'
    );
    expect(searchOne).toHaveBeenCalledWith('StructureDefinition', { url: patient.url, _sort: '-_lastUpdated' });
    expect(console.log).toHaveBeenCalledWith(`Generated 2 type definitions in ${outputDir}`);
  });

  test('Profile not found on the server', async () => {
    await expect(
      main(['node', 'index.js', 'generate-types', '--profile-url', 'http://example.com/missing', '-o', outputDir])
    ).rejects.toThrow('Process exited with exit code 1');
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('StructureDefinition not found: http://example.com/missing')
    );
  });

  test('Requires at least one input', async () => {
    await expect(main(['node', 'index.js', 'generate-types', '-o', outputDir])).rejects.toThrow(
      'Process exited with exit code 1'
    );
    expect(process.stderr.write).toHaveBeenCalledWith(
      expect.stringContaining('At least one file or --profile-url is required')
    );
  });
});
